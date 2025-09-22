import { useState, useRef, useCallback, useEffect } from 'react';

interface BlinkEvent {
  type: 'blink';
  isBlinking: boolean;
  timestamp: number;
  leftEar: number;
  rightEar: number;
}

interface RemoteBlinkState {
  isBlinking: boolean;
  leftEar: number;
  rightEar: number;
  lastUpdate: number;
  latency: number;
}

interface BlinkTransmissionConfig {
  sendData?: (message: any) => void;  // Function to send data via peer connection
  username: string;
}

const useBlinkTransmission = (config: BlinkTransmissionConfig) => {
  const [remoteBlinkState, setRemoteBlinkState] = useState<RemoteBlinkState>({
    isBlinking: false,
    leftEar: 0.4,
    rightEar: 0.4,
    lastUpdate: Date.now(),
    latency: 0
  });

  const sentEventsRef = useRef<Map<number, number>>(new Map()); // timestamp -> sent time
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Send blink event to opponent
  const sendBlinkEvent = useCallback((blinkEvent: BlinkEvent) => {
    if (config.sendData) {
      const message = {
        type: 'OPTIMIZED_BLINK',
        payload: blinkEvent
      };
      
      // Track sent event for latency calculation
      sentEventsRef.current.set(blinkEvent.timestamp, Date.now());
      
      config.sendData(message);
      console.log(`📤 Sent blink event: ${blinkEvent.isBlinking ? '😑' : '👁️'} (EAR: L${blinkEvent.leftEar.toFixed(2)}, R${blinkEvent.rightEar.toFixed(2)})`);
    }
  }, [config.sendData]);

  // Receive blink event from opponent
  const receiveBlinkEvent = useCallback((blinkEvent: BlinkEvent) => {
    const now = Date.now();
    const latency = now - blinkEvent.timestamp;
    
    // Calculate round-trip latency if we have the sent time
    let roundTripLatency = latency;
    const sentTime = sentEventsRef.current.get(blinkEvent.timestamp);
    if (sentTime) {
      roundTripLatency = now - sentTime;
      sentEventsRef.current.delete(blinkEvent.timestamp);
    }
    
    setRemoteBlinkState({
      isBlinking: blinkEvent.isBlinking,
      leftEar: blinkEvent.leftEar,
      rightEar: blinkEvent.rightEar,
      lastUpdate: now,
      latency: Math.min(latency, 500) // Cap latency display at 500ms
    });
    
    console.log(`📥 Received blink event: ${blinkEvent.isBlinking ? '😑' : '👁️'} (latency: ${latency}ms)`);
  }, []);

  // Listen for received blink events from peer connection
  useEffect(() => {
    const handleReceivedBlink = (event: CustomEvent) => {
      receiveBlinkEvent(event.detail);
    };

    window.addEventListener('optimizedBlinkReceived', handleReceivedBlink as EventListener);
    
    return () => {
      window.removeEventListener('optimizedBlinkReceived', handleReceivedBlink as EventListener);
    };
  }, [receiveBlinkEvent]);

  // Clean up old sent events (prevent memory leak)
  useEffect(() => {
    cleanupIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const fiveSecondsAgo = now - 5000;
      
      sentEventsRef.current.forEach((sentTime, timestamp) => {
        if (sentTime < fiveSecondsAgo) {
          sentEventsRef.current.delete(timestamp);
        }
      });
    }, 10000); // Clean up every 10 seconds
    
    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []);

  // Check if remote blink data is stale (connection issues)
  const isRemoteDataStale = useCallback(() => {
    return Date.now() - remoteBlinkState.lastUpdate > 3000; // 3 seconds
  }, [remoteBlinkState.lastUpdate]);

  return {
    // Local actions
    sendBlinkEvent,
    receiveBlinkEvent,
    
    // Remote state
    remoteBlinkState,
    isRemoteDataStale: isRemoteDataStale(),
    
    // Stats
    averageLatency: remoteBlinkState.latency
  };
};

export default useBlinkTransmission;