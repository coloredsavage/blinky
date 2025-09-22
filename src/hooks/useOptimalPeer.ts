import { useState, useEffect, useRef, useCallback } from 'react';
import * as SimplePeer from 'simple-peer';
import io, { Socket } from 'socket.io-client';

interface BlinkEvent {
  type: 'blink';
  isBlinking: boolean;
  timestamp: number;
  playerId: string;
  confidence: number;
}

interface OpponentBlinkState {
  isBlinking: boolean;
  lastBlinkTime: number;
  blinkCount: number;
  confidence: number;
}

interface OptimalPeerReturn {
  // Connection state
  isConnected: boolean;
  connectionStatus: string;
  connectionError: string | null;
  opponent: { username: string; socketId: string } | null;
  
  // Video streams
  remoteVideoStream: MediaStream | null;
  
  // Opponent blink state
  opponentBlinkState: OpponentBlinkState;
  
  // Actions
  createRoom: (roomId: string) => void;
  joinRoom: (roomId: string) => void;
  sendBlinkEvent: (blinkEvent: BlinkEvent) => void;
  addLocalCroppedStream: (stream: MediaStream) => void;
  cleanup: () => void;
}

const useOptimalPeer = (username: string): OptimalPeerReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<{ username: string; socketId: string } | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const [opponentBlinkState, setOpponentBlinkState] = useState<OpponentBlinkState>({
    isBlinking: false,
    lastBlinkTime: 0,
    blinkCount: 0,
    confidence: 0
  });
  
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const dataChannelReadyRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  
  // WebRTC Configuration
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
    if (socketRef.current) return socketRef.current;
    
    console.log('🔗 Initializing optimal peer socket');
    const socket = io('http://localhost:3001', {
      transports: ['polling'], // Use polling for reliability
      timeout: 10000,
      forceNew: true
    });
    
    socket.on('connect', () => {
      console.log('🔗 Connected to signaling server');
      setConnectionStatus('Connected to server');
      setConnectionError(null);
    });
    
    socket.on('disconnect', () => {
      console.log('🔗 Disconnected from signaling server');
      setConnectionStatus('Disconnected');
      setIsConnected(false);
      cleanup();
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      setConnectionError('Failed to connect to server');
      setConnectionStatus('Connection failed');
    });
    
    // Room events
    socket.on('room-joined', (data) => {
      console.log('🏠 Joined room:', data);
      setConnectionStatus('Room joined successfully');
    });
    
    socket.on('room-created', (data) => {
      console.log('🏠 Created room:', data);
      setConnectionStatus('Room created successfully');
    });
    
    socket.on('room-error', (data) => {
      console.error('❌ Room error:', data);
      setConnectionError(data.message);
    });
    
    socket.on('user-joined', (data) => {
      console.log('👤 User joined:', data);
      setOpponent({ username: data.username, socketId: data.socketId });
      setConnectionStatus('Opponent joined, establishing connection...');
    });
    
    socket.on('user-left', () => {
      console.log('👤 User left');
      setOpponent(null);
      setIsConnected(false);
      cleanup();
    });
    
    // WebRTC signaling
    socket.on('webrtc-offer', async (data) => {
      console.log('📡 Received WebRTC offer');
      handleOffer(data);
    });
    
    socket.on('webrtc-answer', (data) => {
      console.log('📡 Received WebRTC answer');
      if (peerRef.current) {
        peerRef.current.signal(data.answer);
      }
    });
    
    socket.on('webrtc-ice-candidate', (data) => {
      console.log('🧊 Received ICE candidate');
      if (peerRef.current) {
        peerRef.current.signal(data.candidate);
      }
    });
    
    socketRef.current = socket;
    return socket;
  }, []);
  
  // Create peer connection
  const createPeer = useCallback((isInitiator: boolean, targetSocketId?: string) => {
    console.log(`🔗 Creating optimal peer connection (initiator: ${isInitiator})`);
    
    const peer = new SimplePeer({
      initiator: isInitiator,
      stream: localStreamRef.current || undefined,
      config: rtcConfig,
      trickle: true
    });
    
    // Handle signaling
    peer.on('signal', (data) => {
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
    
    // Handle connection
    peer.on('connect', () => {
      console.log('✅ Optimal peer connected!');
      setIsConnected(true);
      setConnectionStatus('Connected to opponent');
      setConnectionError(null);
      dataChannelReadyRef.current = true;
    });
    
    // Handle incoming video stream (opponent's cropped eyes)
    peer.on('stream', (stream) => {
      console.log('📹 Received opponent cropped video stream');
      setRemoteVideoStream(stream);
    });
    
    // Handle lightweight data messages (blink events)
    peer.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'blink') {
          handleBlinkEvent(message as BlinkEvent);
        }
      } catch (error) {
        console.error('❌ Failed to parse peer data:', error);
      }
    });
    
    peer.on('error', (error) => {
      console.error('❌ Peer error:', error);
      setConnectionError(`Peer error: ${error.message}`);
    });
    
    peer.on('close', () => {
      console.log('🔗 Peer connection closed');
      setIsConnected(false);
      setRemoteVideoStream(null);
      dataChannelReadyRef.current = false;
    });
    
    peerRef.current = peer;
    return peer;
  }, []);
  
  // Handle incoming blink events from opponent
  const handleBlinkEvent = useCallback((blinkEvent: BlinkEvent) => {
    console.log('👁️ Opponent blink event:', blinkEvent);
    
    setOpponentBlinkState(prev => ({
      isBlinking: blinkEvent.isBlinking,
      lastBlinkTime: blinkEvent.timestamp,
      blinkCount: blinkEvent.isBlinking ? prev.blinkCount + 1 : prev.blinkCount,
      confidence: blinkEvent.confidence
    }));
    
    // Auto-reset blink state after 200ms for visual effect
    if (blinkEvent.isBlinking) {
      setTimeout(() => {
        setOpponentBlinkState(prev => ({
          ...prev,
          isBlinking: false
        }));
      }, 200);
    }
  }, []);
  
  // Handle WebRTC offer
  const handleOffer = useCallback((data: any) => {
    console.log('📡 Handling WebRTC offer');
    const peer = createPeer(false, data.from);
    if (peer) {
      peer.signal(data.offer);
    }
  }, [createPeer]);
  
  // Send lightweight blink event
  const sendBlinkEvent = useCallback((blinkEvent: BlinkEvent) => {
    if (peerRef.current && dataChannelReadyRef.current && isConnected) {
      try {
        const data = JSON.stringify(blinkEvent);
        peerRef.current.send(data);
        console.log('📤 Sent blink event:', blinkEvent);
      } catch (error) {
        console.error('❌ Failed to send blink event:', error);
      }
    }
  }, [isConnected]);
  
  // Add local cropped video stream
  const addLocalCroppedStream = useCallback((stream: MediaStream) => {
    localStreamRef.current = stream;
    
    if (peerRef.current) {
      // Replace or add video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          peerRef.current.addTrack(videoTrack, stream);
          console.log('✅ Added cropped video stream to peer');
        } catch (error) {
          console.error('❌ Failed to add video track:', error);
        }
      }
    }
  }, []);
  
  // Create room
  const createRoom = useCallback((roomId: string) => {
    console.log('🏠 Creating room:', roomId);
    const socket = initializeSocket();
    setConnectionStatus('Creating room...');
    socket.emit('create-room', { roomId, username });
  }, [username, initializeSocket]);
  
  // Join room
  const joinRoom = useCallback((roomId: string) => {
    console.log('🏠 Joining room:', roomId);
    const socket = initializeSocket();
    setConnectionStatus('Joining room...');
    socket.emit('join-room', { roomId, username });
  }, [username, initializeSocket]);
  
  // Cleanup
  const cleanup = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    
    setRemoteVideoStream(null);
    setIsConnected(false);
    setOpponent(null);
    dataChannelReadyRef.current = false;
    localStreamRef.current = null;
  }, []);
  
  // Set up peer connection listener
  useEffect(() => {
    if (socketRef.current) {
      const handlePeerConnectionRequest = (data: any) => {
        console.log('🔗 Creating peer connection to:', data.targetSocketId || data.target);
        createPeer(true, data.targetSocketId || data.target);
      };
      
      socketRef.current.on('create-peer-connection', handlePeerConnectionRequest);
      
      return () => {
        if (socketRef.current) {
          socketRef.current.off('create-peer-connection', handlePeerConnectionRequest);
        }
      };
    }
  }, [createPeer]);
  
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
    isConnected,
    connectionStatus,
    connectionError,
    opponent,
    remoteVideoStream,
    opponentBlinkState,
    createRoom,
    joinRoom,
    sendBlinkEvent,
    addLocalCroppedStream,
    cleanup
  };
};

export default useOptimalPeer;