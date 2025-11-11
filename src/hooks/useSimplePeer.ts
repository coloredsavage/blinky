import { useState, useEffect, useRef, useCallback } from 'react';
import SimplePeer from 'simple-peer';
import io, { Socket } from 'socket.io-client';

interface Opponent {
  username: string;
  socketId: string;
}

export interface GameMessage {
  type: 'READY_STATE' | 'BLINK' | 'GAME_STATE' | 'USER_INFO';
  payload?: any;
}

// CRITICAL CHANGE: Accept external socket as parameter to prevent duplicate connections
const useSimplePeer = (username: string, externalSocket: Socket | null = null) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peer, setPeer] = useState<SimplePeer.Instance | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [isOpponentReady, setIsOpponentReady] = useState<boolean>(false);
  const [lastBlinkWinner, setLastBlinkWinner] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Not connected');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLocalStreamReady, setIsLocalStreamReady] = useState<boolean>(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  // CRITICAL: Use external socket if provided, otherwise allow internal creation
  const socketRef = useRef<Socket | null>(externalSocket);
  const roomIdRef = useRef<string | null>(null);
  const hasJoinedRoomRef = useRef<boolean>(false);
  const hasCreatedRoomRef = useRef<boolean>(false);

  // Update socket ref when external socket changes
  useEffect(() => {
    if (externalSocket) {
      console.log('📌 [useSimplePeer] Using external socket:', externalSocket.id);
      socketRef.current = externalSocket;
      setSocket(externalSocket);
    }
  }, [externalSocket]);

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
    const handlePeerConnectionRequest = async (data: any) => {
      console.log('🔗 ========== SERVER REQUESTED PEER CONNECTION ==========');
      console.log('🔗 Target socket ID:', data.targetSocketId);
      console.log('🔗 Creating peer as INITIATOR');

      // Wait for local stream if not ready (needed for continuous mode)
      if (!localStreamRef.current) {
        console.log('⏳ Local stream not ready, waiting...');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max
        while (!localStreamRef.current && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (!localStreamRef.current) {
          console.error('❌ Timeout waiting for local stream');
          return;
        }
        console.log('✅ Local stream ready after waiting');
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

      // Debug: Check if data channel is available
      console.log('🔗 Peer created with data channel configuration');

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
        console.log('✅ ========== PEER CONNECT EVENT FIRED ==========');
        console.log('✅ Peer connected successfully!');
        console.log('🔗 Peer connection state:', newPeer.connected);
        setIsConnected(true);
        setConnectionStatus('Connected to opponent');
        setConnectionError(null);
        
        // For global matches, we need to set opponent data when connected
        // Send our username to the opponent with retry mechanism
        const sendUserInfo = (attempts = 0) => {
          if (attempts > 5) {
            console.error('❌ Failed to send USER_INFO after 5 attempts');
            return;
          }

          if (username && newPeer.connected) {
            console.log(`📤 Attempting to send USER_INFO message (attempt ${attempts + 1})...`);
            try {
              const message = { type: 'USER_INFO', payload: { username } };
              newPeer.send(JSON.stringify(message));
              console.log('✅ USER_INFO message sent successfully');
            } catch (error) {
              console.error('❌ Failed to send USER_INFO:', error);
              // Retry after 500ms
              setTimeout(() => sendUserInfo(attempts + 1), 500);
            }
          } else {
            console.log(`⚠️ Cannot send USER_INFO (attempt ${attempts + 1}) - retrying in 500ms...`);
            setTimeout(() => sendUserInfo(attempts + 1), 500);
          }
        };

        // Start sending with delay to ensure data channel is ready
        setTimeout(() => sendUserInfo(), 100);
        console.log('✅ =============================================');
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
        console.log('📨 ========== RECEIVED PEER DATA ==========');
        console.log('📨 Raw peer data:', peerData);
        console.log('📨 Data type:', typeof peerData);
        console.log('📨 Data length:', peerData.length);
        
        try {
          const messageString = peerData.toString();
          console.log('📨 Parsed message string:', messageString);
          const message = JSON.parse(messageString);
          console.log('📨 Parsed message object:', message);
          handleGameMessage(message);
          console.log('✅ Game message handled successfully');
        } catch (error) {
          console.error('❌ Failed to parse game message:', error);
          console.error('❌ Error details:', error);
        }
        console.log('📨 ========================================');
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

  // Cleanup only peer connection (keep camera for continuous play)
  const cleanupPeerOnly = useCallback(() => {
    console.log('🧹 [cleanupPeerOnly] Cleaning up peer connection only (keeping camera)');

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
      setPeer(null);
    }

    setRemoteStream(null);
    setIsConnected(false);
    setOpponent(null);
    setIsOpponentReady(false);
    setLastBlinkWinner(null);

    console.log('✅ [cleanupPeerOnly] Peer cleanup complete, camera still active');
  }, []);

  // Full cleanup (stop camera and disconnect everything)
  const cleanup = useCallback(() => {
    console.log('🧹 [cleanup] Full cleanup - stopping camera and destroying peer');

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
      setPeer(null);
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setIsLocalStreamReady(false);
    }

    setRemoteStream(null);
    setIsConnected(false);
    setOpponent(null);
    setIsOpponentReady(false);
    setLastBlinkWinner(null);

    // Reset room creation/joining flags
    hasJoinedRoomRef.current = false;
    hasCreatedRoomRef.current = false;

    console.log('✅ [cleanup] Full cleanup complete');
  }, []);

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    // If external socket is provided, use it instead of creating a new one
    if (externalSocket) {
      console.log('🔌 Using external socket (global matchmaking)');
      socketRef.current = externalSocket;
      setSocket(externalSocket);
      // Register peer listener on external socket
      registerPeerListener(externalSocket);
      return externalSocket;
    }

    if (socketRef.current) {
      console.log('🔌 Socket already exists, reusing...');
      return socketRef.current;
    }

    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
    console.log('🔌 Creating new socket connection to', SOCKET_URL);
    
    const newSocket = io(SOCKET_URL, {
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

    // Socket.IO fallback for ready state (when WebRTC data channel fails)
    newSocket.on('ready-state', (data) => {
      console.log('📥 Received ready-state via Socket.IO:', data);
      if (data.isReady !== undefined) {
        setIsOpponentReady(data.isReady);
      }
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

    // Listen for game messages via Socket.IO (reliable fallback)
    newSocket.on('game-message', (data) => {
      console.log('📨 Received game message via Socket.IO:', data);
      handleGameMessage({
        type: data.type,
        payload: data.payload
      });
    });

    return newSocket;
  }, [externalSocket, registerPeerListener, cleanup]);

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
      console.log('📨 ========== RECEIVED PEER DATA (GUEST) ==========');
      console.log('📨 Raw data:', data);
      try {
        const message: GameMessage = JSON.parse(data.toString());
        console.log('📨 Parsed message:', message);
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

    // Wait for local stream if not ready (needed for continuous mode)
    if (!localStreamRef.current) {
      console.log('⏳ Local stream not ready, waiting...');
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max
      while (!localStreamRef.current && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!localStreamRef.current) {
        console.error('❌ Timeout waiting for local stream');
        setConnectionError('Failed to initialize camera');
        return;
      }
      console.log('✅ Local stream ready after waiting');
    }

    const newPeer = createPeer(false, data.from);
    if (newPeer) {
      newPeer.signal(data.offer);
    }
  }, [createPeer]);

  // Handle game messages
  const handleGameMessage = useCallback((message: GameMessage) => {
    console.log('🎮 ========== RECEIVED GAME MESSAGE ==========');
    console.log('🎮 Message type:', message.type);
    console.log('🎮 Message payload:', message.payload);
    console.log('🎮 Current opponent state:', opponent);
    
    switch (message.type) {
      case 'READY_STATE':
        console.log('📥 Received READY_STATE from opponent:', message.payload?.isReady);
        setIsOpponentReady(message.payload?.isReady || false);
        break;
      case 'BLINK':
        console.log('📥 Received BLINK from opponent - You Win!');
        setLastBlinkWinner('You Win!');
        break;
      case 'GAME_STATE':
        console.log('📥 Received GAME_STATE from opponent:', message.payload);
        if (message.payload?.status === 'ended' && message.payload?.winner === 'opponent') {
          console.log('🏆 Opponent won the game');
          setLastBlinkWinner('You Win!');
        }
        break;
      case 'USER_INFO':
        if (message.payload?.username) {
          console.log('👤 ========== SETTING OPPONENT FROM USER_INFO ==========');
          console.log('👤 Opponent username:', message.payload.username);
          console.log('👤 Before setting opponent:', opponent);
          setOpponent({ username: message.payload.username, socketId: 'global' });
          console.log('👤 After setting opponent - state will update on next render');
        } else {
          console.log('❌ USER_INFO message missing username:', message.payload);
        }
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
    console.log('🎮 ===========================================');
  }, [opponent]);

  // Send game data
  const sendData = useCallback((message: GameMessage) => {
    console.log('🔍 sendData called:', {
      hasPeer: !!peerRef.current,
      isConnected,
      peerConnected: peerRef.current?.connected,
      message
    });

    // ALWAYS use Socket.IO for critical messages (READY_STATE, BLINK)
    // These must be reliable and WebRTC data channel may not be ready
    if (message.type === 'READY_STATE' || message.type === 'BLINK') {
      if (socketRef.current) {
        console.log('📤 Sending critical message via Socket.IO:', message);
        socketRef.current.emit('game-message', {
          roomId: roomIdRef.current,
          type: message.type,
          payload: message.payload
        });
        return; // Don't try WebRTC for critical messages
      } else {
        console.warn('⚠️ Cannot send critical message: no Socket.IO connection');
        return;
      }
    }

    // Try WebRTC data channel for non-critical messages
    let sentViaWebRTC = false;
    if (peerRef.current && isConnected) {
      try {
        peerRef.current.send(JSON.stringify(message));
        console.log('📤 Sent via WebRTC data channel:', message);
        sentViaWebRTC = true;
      } catch (error) {
        console.error('❌ Failed to send via WebRTC:', error);
      }
    }

    // Socket.IO fallback for non-critical messages
    if (!sentViaWebRTC && socketRef.current) {
      console.log('📤 Sending via Socket.IO fallback:', message);
      socketRef.current.emit('game-message', {
        roomId: roomIdRef.current,
        type: message.type,
        payload: message.payload
      });
    }
  }, [isConnected]);

  // Create room
  const createRoom = useCallback(async (roomId: string) => {
    console.log('🏠 HOST: createRoom called with roomId:', roomId, 'username:', username);

    // Store roomId for Socket.IO messages
    roomIdRef.current = roomId;

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

    // Store roomId for Socket.IO messages
    roomIdRef.current = roomId;

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

  // Initialize socket early (on mount) to receive create-peer-connection events from global matchmaking
  useEffect(() => {
    // Only initialize if no external socket provided
    if (!externalSocket && !socketRef.current) {
      console.log('[useSimplePeer] Early socket initialization for room-based mode');
      initializeSocket();
    } else if (externalSocket) {
      console.log('[useSimplePeer] Using external socket, skipping internal initialization');
      // Register peer listener on external socket
      registerPeerListener(externalSocket);
    }
  }, [externalSocket, initializeSocket, registerPeerListener]);

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
      // Only disconnect socket if it's not an external one (we don't own it)
      if (socketRef.current && !externalSocket) {
        console.log('🔌 [unmount] Disconnecting internal socket');
        socketRef.current.disconnect();
        socketRef.current = null;
      } else if (externalSocket) {
        console.log('🔌 [unmount] Keeping external socket connected');
      }
    };
  }, [cleanup, externalSocket]);

  // Reset game state (for continuous mode between matches)
  const resetGameState = useCallback(() => {
    console.log('🔄 Resetting game state for new match');

    // Destroy old peer connection but keep local stream
    if (peerRef.current) {
      console.log('🔄 Destroying old peer connection');
      peerRef.current.destroy();
      peerRef.current = null;
      setPeer(null);
    }

    // Clear remote stream and connection state
    setRemoteStream(null);
    setIsConnected(false);
    setOpponent(null);
    setLastBlinkWinner(null);
    setIsOpponentReady(false);

    // Reset room flags to allow joining new room
    hasJoinedRoomRef.current = false;
    hasCreatedRoomRef.current = false;

    console.log('✅ Game state reset complete, ready for new match');
  }, []);

  // Initialize local stream for continuous mode (without creating a room)
  const initializeLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      console.log('📹 Local stream already initialized');
      setIsLocalStreamReady(true);
      return;
    }

    try {
      console.log('📹 Initializing local stream for continuous mode...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });
      localStreamRef.current = stream;
      setIsLocalStreamReady(true);
      console.log('✅ Local stream initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize local stream:', error);
      setConnectionError('Failed to access camera');
      setIsLocalStreamReady(false);
    }
  }, []);

  // Initialize peer connection explicitly (for continuous play after cleanup)
  const initializePeer = useCallback(() => {
    console.log('🔄 [initializePeer] Setting up peer connection for new match');

    if (!socketRef.current) {
      console.error('❌ [initializePeer] No socket available');
      return;
    }

    if (!localStreamRef.current) {
      console.error('❌ [initializePeer] No local stream available');
      return;
    }

    // Socket is ready and has listeners registered from previous setup
    // Just wait for server to send create-peer-connection event
    console.log('✅ [initializePeer] Ready for peer connection, waiting for server signal');
  }, []);

  return {
    // Connection state
    connection: peer,
    isConnected,
    remoteStream,
    opponent,
    connectionError,
    connectionStatus,
    socket: socketRef.current,
    isLocalStreamReady,
    localStream: localStreamRef.current,

    // Game state
    isOpponentReady,
    lastBlinkWinner,

    // Actions
    createRoom,
    joinRoom,
    sendData,
    cleanup,
    cleanupPeerOnly,
    resetGameState,
    initializeLocalStream,
    initializePeer
  };
};

export default useSimplePeer;
