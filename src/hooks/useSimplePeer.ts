import { useState, useEffect, useRef, useCallback } from 'react';
import SimplePeer from 'simple-peer';
import io, { Socket } from 'socket.io-client';

interface Opponent {
  username: string;
  socketId: string;
}

interface GameMessage {
  type: 'READY_STATE' | 'BLINK' | 'GAME_STATE' | 'USER_INFO' | 'FACE_DATA' | 'ANTI_CHEAT_VIOLATION' | 'EYE_DATA' | 'blink' | 'HYBRID_BLINK';
  payload?: any;
  isBlinking?: boolean;
  timestamp?: number;
  playerId?: string;
  confidence?: number;
}

interface EyeData {
  leftEyeOpenness: number;  // 0-1 scale
  rightEyeOpenness: number; // 0-1 scale
  isBlinking: boolean;
  isFaceCentered: boolean;
  timestamp: number;
  playerId: string;
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
  
  // Anti-cheat face data states
  const [opponentFaceData, setOpponentFaceData] = useState<{
    leftEar: number;
    rightEar: number;
    isFacePresent: boolean;
    faceConfidence: number;
    lastSeenTimestamp: number;
  }>({
    leftEar: 0.4,
    rightEar: 0.4,
    isFacePresent: false,
    faceConfidence: 0,
    lastSeenTimestamp: Date.now()
  });
  const [antiCheatViolation, setAntiCheatViolation] = useState<string | null>(null);
  const [remoteEyeData, setRemoteEyeData] = useState<EyeData | null>(null);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
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

    console.log('🔌 Creating new socket connection to http://localhost:3001', 'Current socket exists:', !!socketRef.current);
    const newSocket = io('http://localhost:3001', {
      transports: ['polling'], // Use polling only to avoid WebSocket 400 errors
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
      
      // For Global Multiplayer guests, implement retry logic when room isn't ready
      const isGlobalMatchId = data.roomId && data.roomId.startsWith('GM_');
      const isRoomNotReady = data.message && data.message.includes('Room not ready yet');
      
      if (isGlobalMatchId && isRoomNotReady) {
        console.log('⏳ Global match room not ready, implementing retry logic...');
        setConnectionStatus('Waiting for host to create room...');
        
        // Retry joining the room after a delay
        setTimeout(() => {
          if (socketRef.current && data.roomId) {
            console.log('🔄 Retrying join room for global match:', data.roomId);
            hasJoinedRoomRef.current = false; // Reset join flag to allow retry
            socketRef.current.emit('join-room', {
              roomId: data.roomId,
              username: username
            });
          }
        }, 2000); // Retry after 2 seconds
        
        return;
      }
      
      // Handle timeout errors with shouldRetryMatch flag
      if (data.shouldRetryMatch) {
        console.log('🔄 Server suggests retrying match due to timeout');
        setConnectionError('Connection timeout. Please try finding a match again.');
        setConnectionStatus('Match timeout - please retry');
        // Let the user manually retry by going back to queue
        return;
      }
      
      // For other errors, show the error normally
      setConnectionError(data.message);
      setConnectionStatus(`Room error: ${data.message}`);
    });

    newSocket.on('user-joined', (data) => {
      console.log('👤 User joined:', data);
      const opponentData = { username: data.username, socketId: data.socketId };
      console.log('🔧 Setting opponent to:', opponentData);
      setOpponent(opponentData);
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

    // Handle hybrid blink fallback messages
    newSocket.on('hybrid-blink', (data) => {
      console.log('🔄 Socket.IO RECEIVED:', {
        hasData: !!data,
        hasDataData: !!(data && data.data),
        fullMessage: data
      });
      if (data && data.data) {
        const blinkEvent = data.data;
        
        // Filter out our own messages - only process opponent data
        if (blinkEvent.playerId === username) {
          console.log('🔄 Ignoring own face data from:', blinkEvent.playerId);
          return;
        }
        
        console.log('👁️ Socket.IO PROCESSING:', {
          isBlinking: blinkEvent.isBlinking ? '😑' : '👁️',
          isFaceVisible: blinkEvent.isFaceVisible,
          timestamp: `${Date.now() - blinkEvent.timestamp}ms ago`,
          from: blinkEvent.playerId,
          fullEvent: blinkEvent
        });
        // Dispatch event for hybrid blink system
        console.log('🔔 Dispatching hybridBlinkReceived event via Socket.IO fallback');
        window.dispatchEvent(new CustomEvent('hybridBlinkReceived', { 
          detail: blinkEvent 
        }));
        console.log('✅ Socket.IO fallback event dispatched successfully');
      } else {
        console.error('❌ Received hybrid-blink with invalid data:', data);
      }
    });

    // Debug: Log when socket connects
    newSocket.on('connect', () => {
      console.log('🔌 Socket connected, hybrid-blink listener is ready');
      console.log('🔍 Socket ID:', newSocket.id);
      
      // Test if socket can receive events
      setTimeout(() => {
        console.log('🧪 Testing Socket.IO connectivity...');
        newSocket.emit('ping'); // This should trigger a 'pong' response
      }, 1000);
    });

    // Handle ping response for connectivity test
    newSocket.on('pong', () => {
      console.log('✅ Socket.IO connectivity test passed');
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
    console.log('📹 Local stream available:', !!localStreamRef.current);
    console.log('📹 Local stream tracks:', localStreamRef.current.getTracks().map(t => `${t.kind}:${t.readyState}:${t.enabled}`));
    
    const newPeer = new SimplePeer({
      initiator: isInitiator,
      stream: localStreamRef.current,
      config: rtcConfig,
      trickle: true,
      allowHalfTrickle: true // Allow connections even with incomplete ICE gathering
    });
    
    console.log('🔗 Peer created with local stream. Will send', localStreamRef.current.getTracks().length, 'tracks to remote peer.');

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
      console.log('📊 Peer state - connected:', newPeer.connected, 'destroyed:', newPeer.destroyed);
      console.log('🔗 Data channel ready for bidirectional transmission');
      console.log('🔍 Stream status - Local available:', !!localStreamRef.current, 'Remote received:', !!remoteStream);
      setIsConnected(true);
      setConnectionStatus('Connected to opponent');
      setConnectionError(null);
    });

    // Handle incoming stream
    newPeer.on('stream', (stream) => {
      console.log('📹 Received remote stream:', stream);
      const tracks = stream.getTracks();
      console.log('📹 Stream tracks:', tracks.map(t => `${t.kind}:${t.readyState}:${t.enabled}`));
      
      // Validate stream has video tracks
      const videoTracks = tracks.filter(t => t.kind === 'video');
      if (videoTracks.length === 0) {
        console.warn('⚠️ Remote stream has no video tracks');
      } else {
        console.log('✅ Remote stream has', videoTracks.length, 'video track(s)');
      }
      
      setRemoteStream(stream);
    });

    // Handle data messages
    newPeer.on('data', (data) => {
      console.log('📤 Raw data received:', data.toString().substring(0, 100) + '...');
      try {
        const message: GameMessage = JSON.parse(data.toString());
        console.log('🔍 Parsed message type:', message.type, 'payload exists:', !!message.payload);
        handleGameMessage(message);
      } catch (error) {
        console.error('❌ Failed to parse game message:', error, 'Raw data:', data.toString());
      }
    });

    // Handle errors
    newPeer.on('error', (error) => {
      console.error('❌ Peer connection error:', error);
      console.error('Error type:', error.name);
      console.error('Error code:', error.code);
      
      // Handle specific error types
      if (error.message && error.message.includes('reading')) {
        console.error('🔍 Stream/track reading error - possible cleanup issue');
        setConnectionError('Video connection interrupted');
      } else {
        setConnectionError(`Peer error: ${error.message || 'Connection failed'}`);
      }
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
      case 'blink':
        // Handle optimal blink events (lightweight)
        console.log('📨 Received optimal blink event:', message.isBlinking ? '😑' : '👁️');
        // Forward to optimal blink system if available
        if (message.isBlinking !== undefined && message.timestamp && message.playerId) {
          // This will be handled by the optimal blink hook
        }
        break;
      case 'USER_INFO':
        if (message.payload?.username) {
          setOpponent(prev => prev ? {...prev, username: message.payload.username} : null);
        }
        break;
      case 'FACE_DATA':
        // Update opponent's face data for anti-cheat validation
        if (message.payload) {
          setOpponentFaceData({
            leftEar: message.payload.leftEar || 0.4,
            rightEar: message.payload.rightEar || 0.4,
            isFacePresent: message.payload.isFacePresent || false,
            faceConfidence: message.payload.faceConfidence || 0,
            lastSeenTimestamp: message.payload.lastSeenTimestamp || Date.now()
          });
        }
        break;
      case 'ANTI_CHEAT_VIOLATION':
        // Handle anti-cheat violation from opponent
        console.error('🚫 Anti-cheat violation detected:', message.payload);
        setAntiCheatViolation(message.payload?.reason || 'Unknown violation');
        setLastBlinkWinner('You Lose - Anti-cheat violation');
        break;
      case 'EYE_DATA':
        // Handle real-time eye data from opponent (replaces video streaming)
        if (message.payload) {
          const eyeData: EyeData = message.payload;
          const latency = Date.now() - eyeData.timestamp;
          console.log('👁️ Received eye data, latency:', latency, 'ms', eyeData);
          setRemoteEyeData(eyeData);
        }
        break;
      case 'HYBRID_BLINK':
        // Handle hybrid blink events from opponent (lightweight transmission)
        if (message.payload) {
          const blinkEvent = message.payload;
          console.log('👁️ Received hybrid blink event:', blinkEvent.isBlinking ? '😑' : '👁️', `(${Date.now() - blinkEvent.timestamp}ms ago)`, 'from:', blinkEvent.playerId);
          // Dispatch event for hybrid blink system
          console.log('🔔 Dispatching hybridBlinkReceived event:', blinkEvent);
          window.dispatchEvent(new CustomEvent('hybridBlinkReceived', { 
            detail: blinkEvent 
          }));
          console.log('✅ Event dispatched successfully');
        } else {
          console.log('⚠️ Received HYBRID_BLINK message with no payload');
        }
        break;
      case 'OPTIMIZED_BLINK':
        // Handle optimized blink events from opponent
        if (message.payload) {
          console.log('👁️ Received optimized blink event:', message.payload);
          // This will be handled by the blink transmission hook
          window.dispatchEvent(new CustomEvent('optimizedBlinkReceived', { 
            detail: message.payload 
          }));
        }
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }, []);

  // Note: Canvas streaming removed to reduce video lag

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

  // Send eye data (optimized for low latency)
  const sendEyeData = useCallback((eyeData: Omit<EyeData, 'timestamp' | 'playerId'>) => {
    if (peerRef.current && isConnected) {
      try {
        const startTime = performance.now();
        const data: GameMessage = {
          type: 'EYE_DATA',
          payload: {
            ...eyeData,
            timestamp: Date.now(),
            playerId: username
          }
        };
        peerRef.current.send(JSON.stringify(data));
        const endTime = performance.now();
        if (endTime - startTime > 2) {
          console.log('👁️ Eye data sent in', endTime - startTime, 'ms');
        }
      } catch (error) {
        console.error('❌ Failed to send eye data:', error);
      }
    } else {
      console.warn('⚠️ Cannot send eye data: peer not connected', { 
        hasPeer: !!peerRef.current, 
        isConnected 
      });
    }
  }, [isConnected, username]);

  // Send hybrid blink data (ultra-lightweight transmission)
  const sendHybridBlink = useCallback((isBlinking: boolean, confidence: number = 1.0, isFaceVisible?: boolean, landmarkCount?: number, faceCenter?: { x: number; y: number }, faceBounds?: { width: number; height: number }) => {
    const blinkData = {
      isBlinking,
      confidence,
      timestamp: Date.now(),
      playerId: username,
      isFaceVisible: isFaceVisible ?? true, // Default to true if not provided
      landmarkCount: landmarkCount ?? 0,
      faceCenter: faceCenter ?? null, // Face center coordinates for smart tracking
      faceBounds: faceBounds ?? null   // Face dimensions for smart tracking
    };
    

    // TEMPORARY: Force Socket.IO fallback since SimplePeer data channel is broken
    console.log('🔧 Forcing Socket.IO fallback due to SimplePeer data channel issues');

    // Fallback to Socket.IO if SimplePeer data channel is broken
    if (socketRef.current && opponent) {
      try {
        socketRef.current.emit('hybrid-blink', {
          target: opponent.socketId,
          data: blinkData
        });
        console.log('🔄 Socket.IO SENDING:', {
          isBlinking: isBlinking ? '😑' : '👁️',
          isFaceVisible: blinkData.isFaceVisible,
          from: socketRef.current.id,
          to: opponent.socketId,
          fullData: blinkData
        });
      } catch (error) {
        console.error('❌ Failed to send hybrid blink via Socket.IO:', error);
      }
    } else {
      console.log('🚫 Cannot send hybrid blink - no connection available');
      console.log('🔍 Debug: socketRef.current:', !!socketRef.current, 'opponent:', opponent);
    }
  }, [isConnected, username, opponent]);

  // Debug opponent state changes
  useEffect(() => {
    console.log('🔍 Opponent state changed:', opponent);
  }, [opponent]);

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
    
    if (canvasStreamRef.current) {
      canvasStreamRef.current.getTracks().forEach(track => track.stop());
      canvasStreamRef.current = null;
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

  // Set up peer connection listener when socket becomes available
  useEffect(() => {
    if (socket && socketRef.current) {
      const handlePeerConnectionRequest = (data: any) => {
        console.log('🔗 Server requested peer connection to:', data.targetSocketId);
        console.log('🔗 Peer connection data:', data);
        if (data.targetSocketId) {
          createPeer(true, data.targetSocketId);
        } else {
          console.error('❌ No targetSocketId provided for peer connection');
        }
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
    
    // Anti-cheat data
    opponentFaceData,
    antiCheatViolation,
    
    // Real-time eye data
    remoteEyeData,
    
    // Actions
    createRoom,
    joinRoom,
    sendData,
    sendEyeData,
    sendHybridBlink,
    cleanup
  };
};

export default useSimplePeer;