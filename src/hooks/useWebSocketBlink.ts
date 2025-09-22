import { useState, useEffect, useRef, useCallback } from 'react';

interface BlinkMessage {
  isBlinking: boolean;
  eyeOpenness: number;
  faceDetected: boolean;
  timestamp: number;
  playerId: string;
}

interface RemoteBlinkData extends BlinkMessage {
  latency: number;
}

// Ultra-low latency WebSocket with binary protocol
const useWebSocketBlink = (username: string, roomId: string | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [remoteBlinkData, setRemoteBlinkData] = useState<RemoteBlinkData | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentTime = useRef<number>(0);

  // Create binary protocol for ultra-fast transmission
  const createBlinkPacket = useCallback((data: Omit<BlinkMessage, 'playerId'>) => {
    const buffer = new ArrayBuffer(13); // Optimized packet size
    const view = new DataView(buffer);
    
    view.setUint8(0, data.isBlinking ? 1 : 0);        // 1 byte - blink state
    view.setFloat32(1, data.eyeOpenness);             // 4 bytes - eye openness
    view.setUint8(5, data.faceDetected ? 1 : 0);      // 1 byte - face detected
    view.setFloat64(6, data.timestamp);               // 8 bytes - timestamp (high precision)
    
    return buffer;
  }, []);

  // Parse binary packet
  const parseBlinkPacket = useCallback((buffer: ArrayBuffer, playerId: string): RemoteBlinkData => {
    const view = new DataView(buffer);
    const timestamp = view.getFloat64(6);
    
    return {
      isBlinking: view.getUint8(0) === 1,
      eyeOpenness: view.getFloat32(1),
      faceDetected: view.getUint8(5) === 1,
      timestamp,
      playerId,
      latency: performance.now() - timestamp
    };
  }, []);

  // Send blink data (throttled to 60 FPS max)
  const sendBlinkData = useCallback((data: Omit<BlinkMessage, 'playerId'>) => {
    const now = performance.now();
    if (now - lastSentTime.current < 16) return; // 60 FPS throttle
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const packet = createBlinkPacket({
          ...data,
          timestamp: now
        });
        
        wsRef.current.send(packet);
        lastSentTime.current = now;
      } catch (error) {
        console.error('❌ Failed to send blink data:', error);
      }
    }
  }, [createBlinkPacket]);

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (!roomId) return;

    try {
      // Use WebSocket instead of Socket.IO for lower overhead
      const wsUrl = `ws://localhost:3001/blink/${roomId}?username=${encodeURIComponent(username)}`;
      console.log('🔌 Connecting to WebSocket:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected for ultra-low latency blink data');
        setIsConnected(true);
        setConnectionError(null);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          try {
            const remoteData = parseBlinkPacket(event.data, 'opponent');
            setRemoteBlinkData(remoteData);
            
            // Log latency for performance monitoring
            if (remoteData.latency < 100) {
              console.log('⚡ Ultra-low latency achieved:', remoteData.latency.toFixed(1), 'ms');
            }
          } catch (error) {
            console.error('❌ Failed to parse blink packet:', error);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionError('WebSocket connection failed');
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setIsConnected(false);
        
        // Auto-reconnect after 2 seconds
        setTimeout(() => {
          if (roomId) {
            connect();
          }
        }, 2000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      setConnectionError('Failed to create WebSocket connection');
    }
  }, [roomId, username, parseBlinkPacket]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Auto-connect when room ID is available
  useEffect(() => {
    if (roomId) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [roomId, connect, disconnect]);

  return {
    isConnected,
    remoteBlinkData,
    connectionError,
    sendBlinkData,
    connect,
    disconnect
  };
};

export default useWebSocketBlink;