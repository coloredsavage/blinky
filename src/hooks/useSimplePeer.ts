import { useState, useEffect, useRef, useCallback } from 'react';
import SimplePeer from 'simple-peer';
import io, { Socket } from 'socket.io-client';

interface Opponent {
  username: string;
  socketId: string;
}

interface GameMessage {
  type: 'READY_STATE' | 'BLINK' | 'GAME_STATE' | 'USER_INFO';
  payload?: any;
}

const useSimplePeer = (username: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peer, setPeer] = useState<SimplePeer.Instance | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [isOpponentReady, setIsOpponentReady] = useState<boolean>(false);
  const [lastBlinkWinner, setLastBlinkWinner] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Not connected');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const hasJoinedRoomRef = useRef<boolean>(false);
  const hasCreatedRoomRef = useRef<boolean>(false);

  // WebRTC Configuration - using the same STUN/TURN servers from the example
  const rtcConfig = {
    iceServers: [
      { urls: "stun:openrelay.metered.ca:80" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject", 
        credential: "openrelayproject"
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  };

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('🔌 Socket already exists, reusing...');
      return socketRef.current;
    }

    console.log('🔌 Creating new socket connection to http://localhost:3001');
    const newSocket = io('http://localhost:3001', {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true
    });

    console.log('🔌 Socket created, setting up event listeners...');

    newSocket.on('connect', () => {
      console.log('🔌 Connected to signaling server');
      setConnectionStatus('Connected to server');
      setConnectionError(null);
      setSocket(newSocket);
      socketRef.current = newSocket;
    });

    newSocket.on('connection-confirmed', (data) => {
      console.log('✅ Server confirmed connection:', data);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from signaling server');
      setConnectionStatus('Disconnected from server');
      setIsConnected(false);
      cleanup();
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      setConnectionError('Failed to connect to server');
      setConnectionStatus('Connection failed');
    });

    // Room management
    newSocket.on('room-joined', (data) => {
      console.log('🏠 Successfully joined room:', data);
      setConnectionStatus('Room joined successfully');
      setConnectionError(null);
    });

    newSocket.on('room-created', (data) => {
      console.log('🏠 Successfully created room:', data);
      setConnectionStatus('Room created successfully');
      setConnectionError(null);
    });

    newSocket.on('room-error', (data) => {
      console.error('❌ Room error:', data);
      setConnectionError(data.message);
      setConnectionStatus(`Room error: ${data.message}`);
    });

    newSocket.on('user-joined', (data) => {
      console.log('👤 User joined:', data);
      setOpponent({ username: data.username, socketId: data.socketId });
      setConnectionStatus('User joined, establishing connection...');
    });

    newSocket.on('user-left', () => {
      console.log('👤 User left');
      setOpponent(null);
      setIsOpponentReady(false);
      setIsConnected(false);
      cleanup();
    });

    // WebRTC signaling
    newSocket.on('webrtc-offer', async (data) => {
      console.log('📡 Received WebRTC offer');
      await handleOffer(data);
    });

    newSocket.on('webrtc-answer', async (data) => {
      console.log('📡 Received WebRTC answer');
      if (peerRef.current) {
        peerRef.current.signal(data.answer);
      }
    });

    newSocket.on('webrtc-ice-candidate', (data) => {
      console.log('🧊 Received ICE candidate');
      if (peerRef.current) {
        peerRef.current.signal(data.candidate);
      }
    });

    return newSocket;
  }, []);

  // Create peer connection
  const createPeer = useCallback((isInitiator: boolean, targetSocketId?: string) => {
    if (!localStreamRef.current) {
      console.error('❌ No local stream available');
      return;
    }

    console.log(`🔗 Creating peer connection (initiator: ${isInitiator})`);
    
    const newPeer = new SimplePeer({
      initiator: isInitiator,
      stream: localStreamRef.current,
      config: rtcConfig,
      trickle: true
    });

    // Handle signaling
    newPeer.on('signal', (data) => {
      console.log('📡 Sending signal:', data.type);
      if (socketRef.current && targetSocketId) {
        if (data.type === 'offer') {
          socketRef.current.emit('webrtc-offer', { offer: data, target: targetSocketId });
        } else if (data.type === 'answer') {
          socketRef.current.emit('webrtc-answer', { answer: data, target: targetSocketId });
        } else {
          socketRef.current.emit('webrtc-ice-candidate', { candidate: data, target: targetSocketId });
        }
      }
    });

    // Handle successful connection
    newPeer.on('connect', () => {
      console.log('✅ Peer connected successfully!');
      setIsConnected(true);
      setConnectionStatus('Connected to opponent');
      setConnectionError(null);
    });

    // Handle incoming stream
    newPeer.on('stream', (stream) => {
      console.log('📹 Received remote stream:', stream);
      console.log('📹 Stream tracks:', stream.getTracks());
      setRemoteStream(stream);
    });

    // Handle data messages
    newPeer.on('data', (data) => {
      try {
        const message: GameMessage = JSON.parse(data.toString());
        handleGameMessage(message);
      } catch (error) {
        console.error('❌ Failed to parse game message:', error);
      }
    });

    // Handle errors
    newPeer.on('error', (error) => {
      console.error('❌ Peer connection error:', error);
      setConnectionError(`Peer error: ${error.message}`);
    });

    // Handle close
    newPeer.on('close', () => {
      console.log('🔌 Peer connection closed');
      setIsConnected(false);
      setRemoteStream(null);
    });

    setPeer(newPeer);
    peerRef.current = newPeer;
    
    return newPeer;
  }, []);

  // Handle WebRTC offer
  const handleOffer = useCallback(async (data: any) => {
    console.log('📡 Handling WebRTC offer');
    const newPeer = createPeer(false, data.from);
    if (newPeer) {
      newPeer.signal(data.offer);
    }
  }, [createPeer]);

  // Handle game messages
  const handleGameMessage = useCallback((message: GameMessage) => {
    console.log('🎮 Received game message:', message);
    
    switch (message.type) {
      case 'READY_STATE':
        setIsOpponentReady(message.payload?.isReady || false);
        break;
      case 'BLINK':
        setLastBlinkWinner('You Win!');
        break;
      case 'USER_INFO':
        if (message.payload?.username) {
          setOpponent(prev => prev ? {...prev, username: message.payload.username} : null);
        }
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }, []);

  // Send game data
  const sendData = useCallback((message: GameMessage) => {
    if (peerRef.current && isConnected) {
      try {
        peerRef.current.send(JSON.stringify(message));
        console.log('📤 Sent game message:', message);
      } catch (error) {
        console.error('❌ Failed to send message:', error);
      }
    } else {
      console.warn('⚠️ Cannot send data: peer not connected');
    }
  }, [isConnected]);

  // Create room
  const createRoom = useCallback(async (roomId: string) => {
    console.log('🏠 HOST: createRoom called with roomId:', roomId, 'username:', username);
    
    if (hasCreatedRoomRef.current) {
      console.log('🏠 HOST: Room already created, skipping duplicate createRoom call');
      return;
    }
    
    hasCreatedRoomRef.current = true;
    
    if (!socketRef.current) {
      console.log('🏠 HOST: No socket, initializing...');
      const socket = initializeSocket();
      socketRef.current = socket;
      
      // Wait for socket to connect
      await new Promise((resolve) => {
        const checkConnection = () => {
          if (socketRef.current?.connected) {
            console.log('🏠 HOST: Socket connected, proceeding with room creation');
            resolve(true);
          } else {
            console.log('🏠 HOST: Waiting for socket connection...');
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    // Get user media first
    try {
      console.log('🏠 HOST: Getting user media...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false // Disable audio for the staring contest
      });
      localStreamRef.current = stream;
      console.log('🏠 HOST: Got user media successfully');
    } catch (error) {
      console.error('❌ Failed to get user media:', error);
      setConnectionError('Failed to access camera');
      return;
    }

    console.log('🏠 HOST: Emitting create-room event with roomId:', roomId);
    setConnectionStatus('Creating room...');
    socketRef.current?.emit('create-room', { roomId, username });
  }, [username, initializeSocket]);

  // Join room
  const joinRoom = useCallback(async (roomId: string) => {
    console.log('🚪 Attempting to join room:', roomId, 'with username:', username);
    
    if (hasJoinedRoomRef.current) {
      console.log('👤 GUEST: Already attempted to join room, skipping duplicate joinRoom call');
      return;
    }
    
    hasJoinedRoomRef.current = true;
    
    if (!socketRef.current) {
      console.log('🔌 No socket, initializing...');
      const socket = initializeSocket();
      // Wait a moment for connection
      await new Promise(resolve => setTimeout(resolve, 1000));
      socketRef.current = socket;
    }

    // Get user media first
    try {
      console.log('📹 Getting user media...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });
      localStreamRef.current = stream;
      console.log('✅ Got user media successfully');
    } catch (error) {
      console.error('❌ Failed to get user media:', error);
      setConnectionError('Failed to access camera');
      return;
    }

    console.log('📤 Emitting join-room event...');
    setConnectionStatus('Joining room...');
    socketRef.current?.emit('join-room', { roomId, username });
  }, [username, initializeSocket, createPeer]);

  // Cleanup
  const cleanup = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
      setPeer(null);
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    setRemoteStream(null);
    setIsConnected(false);
    setOpponent(null);
    setIsOpponentReady(false);
    setLastBlinkWinner(null);
    
    // Reset room creation/joining flags
    hasJoinedRoomRef.current = false;
    hasCreatedRoomRef.current = false;
  }, []);

  // Set up peer connection listener when socket is available
  useEffect(() => {
    if (socketRef.current) {
      const handlePeerConnectionRequest = (data: any) => {
        console.log('🔗 Server requested peer connection to:', data.targetSocketId);
        createPeer(true, data.targetSocketId);
      };

      socketRef.current.on('create-peer-connection', handlePeerConnectionRequest);

      return () => {
        if (socketRef.current) {
          socketRef.current.off('create-peer-connection', handlePeerConnectionRequest);
        }
      };
    }
  }, [socket, createPeer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [cleanup]);

  return {
    // Connection state
    connection: peer,
    isConnected,
    remoteStream,
    opponent,
    connectionError,
    connectionStatus,
    
    // Game state
    isOpponentReady,
    lastBlinkWinner,
    
    // Actions
    createRoom,
    joinRoom,
    sendData,
    cleanup
  };
};

export default useSimplePeer;