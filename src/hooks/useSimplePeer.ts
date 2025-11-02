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

  // Set up peer connection listener - stable function that won't cause re-renders
  const registerPeerListener = useCallback((socket: Socket) => {
    const handlePeerConnectionRequest = (data: any) => {
      console.log('🔗 ========== SERVER REQUESTED PEER CONNECTION ==========');
      console.log('🔗 Target socket ID:', data.targetSocketId);
      console.log('🔗 Creating peer as INITIATOR');

      // Create peer directly using refs to avoid dependency issues
      if (!localStreamRef.current) {
        console.error('❌ No local stream available');
        return;
      }

      console.log(`🔗 Creating peer connection (initiator: true)`);
      console.log('📹 Local stream for peer:', localStreamRef.current);
      console.log('📹 Local stream tracks:', localStreamRef.current.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState,
        id: t.id
      })));

      const newPeer = new SimplePeer({
        initiator: true,
        stream: localStreamRef.current,
        config: rtcConfig,
        trickle: true
      });

      console.log('🔗 SimplePeer instance created, waiting for events...');

      // Set up all peer event handlers
      newPeer.on('signal', (signalData) => {
        console.log('📡 Sending signal:', signalData.type);
        if (socketRef.current && data.targetSocketId) {
          if (signalData.type === 'offer') {
            socketRef.current.emit('webrtc-offer', { offer: signalData, target: data.targetSocketId });
          } else if (signalData.type === 'answer') {
            socketRef.current.emit('webrtc-answer', { answer: signalData, target: data.targetSocketId });
          } else {
            socketRef.current.emit('webrtc-ice-candidate', { candidate: signalData, target: data.targetSocketId });
          }
        }
      });

      newPeer.on('connect', () => {
        console.log('✅ Peer connected successfully!');
        console.log('🔗 Peer connection state:', newPeer.connected);
        setIsConnected(true);
        setConnectionStatus('Connected to opponent');
        setConnectionError(null);
        
        // For global matches, we need to set opponent data when connected
        // Send our username to the opponent
        if (username && newPeer.connected) {
          console.log('📤 Attempting to send USER_INFO message...');
          try {
            const message = { type: 'USER_INFO', payload: { username } };
            console.log('📤 USER_INFO message content:', message);
            newPeer.send(JSON.stringify(message));
            console.log('✅ USER_INFO message sent successfully');
          } catch (error) {
            console.error('❌ Failed to send USER_INFO:', error);
          }
        } else {
          console.log('⚠️ Cannot send USER_INFO - missing username or peer not connected');
        }
      });
      
      // Also check if peer is already connected (might happen quickly)
      setTimeout(() => {
        if (newPeer.connected && !isConnected) {
          console.log('🔗 Peer was already connected, updating state');
          setIsConnected(true);
          setConnectionStatus('Connected to opponent');
          setConnectionError(null);
        }
      }, 1000);

      newPeer.on('stream', (stream) => {
        console.log('📹 ========== RECEIVED REMOTE STREAM ==========');
        console.log('📹 Stream ID:', stream.id);
        console.log('📹 Stream active:', stream.active);
        console.log('📹 Stream tracks:', stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          id: t.id,
          label: t.label
        })));
        console.log('📹 Setting remote stream in state...');
        setRemoteStream(stream);
        console.log('📹 ========================================');
      });

      newPeer.on('data', (peerData) => {
        try {
          const message = JSON.parse(peerData.toString());
          handleGameMessage(message);
        } catch (error) {
          console.error('❌ Failed to parse game message:', error);
        }
      });

      newPeer.on('error', (error) => {
        console.error('❌ Peer connection error:', error);
        setConnectionError(`Peer error: ${error.message || 'Connection failed'}`);
      });

      newPeer.on('close', () => {
        console.log('🔌 Peer connection closed');
        setIsConnected(false);
        setRemoteStream(null);
      });

      setPeer(newPeer);
      peerRef.current = newPeer;

      console.log('🔗 ===================================================');
    };

    console.log('[useSimplePeer] ✅ Registering create-peer-connection listener on socket');
    socket.on('create-peer-connection', handlePeerConnectionRequest);
  }, []); // Empty deps - stable function

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
      forceNew: false // Allow reusing existing connection
    });

    console.log('🔌 Socket created, setting up event listeners...');

    // Register peer listener IMMEDIATELY (not waiting for connect)
    // This is critical for global matchmaking where server may send create-peer-connection before connect event
    registerPeerListener(newSocket);

    newSocket.on('connect', () => {
      console.log('🔌 Connected to signaling server');
      console.log('🔌 Socket ID:', newSocket.id);
      setConnectionStatus('Connected to server');
      setConnectionError(null);
      setSocket(newSocket);
      socketRef.current = newSocket;

      // DEBUG: Listen for ALL events
      newSocket.onAny((eventName, ...args) => {
        console.log(`[Socket Event] ${eventName}:`, args);
      });
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
    console.log('📹 Local stream for peer:', localStreamRef.current);
    console.log('📹 Local stream tracks:', localStreamRef.current.getTracks().map(t => ({
      kind: t.kind,
      enabled: t.enabled,
      readyState: t.readyState,
      id: t.id
    })));

    const newPeer = new SimplePeer({
      initiator: isInitiator,
      stream: localStreamRef.current,
      config: rtcConfig,
      trickle: true
    });

    console.log('🔗 SimplePeer instance created, waiting for events...');

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
      console.log('📹 ========== RECEIVED REMOTE STREAM ==========');
      console.log('📹 Stream ID:', stream.id);
      console.log('📹 Stream active:', stream.active);
      console.log('📹 Stream tracks:', stream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState,
        id: t.id,
        label: t.label
      })));
      console.log('📹 Setting remote stream in state...');
      setRemoteStream(stream);
      console.log('📹 ========================================');
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
          console.log('👤 Setting opponent from USER_INFO:', message.payload.username);
          setOpponent({ username: message.payload.username, socketId: 'global' });
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

  // Initialize socket early (on mount) to receive create-peer-connection events from global matchmaking
  useEffect(() => {
    // Initialize socket immediately so it's ready to receive events from global matchmaking
    if (!socketRef.current) {
      console.log('[useSimplePeer] Early socket initialization for global matchmaking');
      initializeSocket();
    }
  }, [initializeSocket]);

  // Debug logging for connection state changes
  useEffect(() => {
    console.log('🔗 useSimplePeer connection state changed:', {
      isConnected,
      connectionStatus,
      opponent,
      remoteStream: !!remoteStream,
      connectionError
    });
  }, [isConnected, connectionStatus, opponent, remoteStream, connectionError]);

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
