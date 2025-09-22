import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

interface BlinkEvent {
  type: 'blink';
  isBlinking: boolean;
  timestamp: number;
  playerId: string;
  confidence: number;
}

interface EyeRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const useOptimalBlink = (
  videoRef: RefObject<HTMLVideoElement>,
  canvasRef: RefObject<HTMLCanvasElement>,
  username: string,
  sendData?: (data: any) => void
) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [remoteBlinkState, setRemoteBlinkState] = useState(false);
  const [eyeOpenness, setEyeOpenness] = useState(1.0);
  
  const croppedCanvasRef = useRef<HTMLCanvasElement>();
  const faceMeshRef = useRef<any>(null);
  const lastBlinkState = useRef(false);
  const animationFrameRef = useRef<number>();

  // Initialize lightweight blink detection (no MediaPipe dependency)
  useEffect(() => {
    setIsReady(true);
    console.log('🚀 Optimal lightweight blink detection initialized - no MediaPipe needed');
  }, []);

  // Create cropped canvas for sending eye region only
  useEffect(() => {
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = 200;  // Small cropped size
    croppedCanvas.height = 100;
    croppedCanvasRef.current = croppedCanvas;
  }, []);

  // Simple blink detection using pixel brightness analysis
  const detectBlinkFromPixels = useCallback((imageData: ImageData) => {
    const { data, width, height } = imageData;
    
    // Define approximate eye regions (as percentages)
    const eyeRegions = [
      { x: width * 0.25, y: height * 0.4, width: width * 0.15, height: height * 0.1 }, // Left eye
      { x: width * 0.6, y: height * 0.4, width: width * 0.15, height: height * 0.1 }   // Right eye  
    ];
    
    let totalEyeBrightness = 0;
    let pixelCount = 0;
    
    // Calculate average brightness in eye regions
    eyeRegions.forEach(region => {
      for (let y = Math.floor(region.y); y < Math.floor(region.y + region.height); y++) {
        for (let x = Math.floor(region.x); x < Math.floor(region.x + region.width); x++) {
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const index = (y * width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const brightness = (r + g + b) / 3;
            totalEyeBrightness += brightness;
            pixelCount++;
          }
        }
      }
    });
    
    if (pixelCount === 0) return { isBlinking: false, eyeOpenness: 0.8 };
    
    const avgEyeBrightness = totalEyeBrightness / pixelCount;
    const eyeOpenness = Math.max(0, Math.min(1, (avgEyeBrightness - 20) / 100));
    const isBlinking = eyeOpenness < 0.3;
    
    return { isBlinking, eyeOpenness };
  }, []);

  // Get simple eye region for cropping (center region)
  const getSimpleEyeRegion = useCallback((): EyeRegion => {
    return {
      x: 0.15,    // 15% from left
      y: 0.35,    // 35% from top  
      width: 0.7,  // 70% width
      height: 0.3  // 30% height
    };
  }, []);

  // Process video frame (lightweight - no MediaPipe)
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !croppedCanvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const croppedCanvas = croppedCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const croppedCtx = croppedCanvas.getContext('2d');
    
    if (!ctx || !croppedCtx || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Set willReadFrequently for better performance
    if (!ctx.canvas.hasAttribute('willReadFrequently')) {
      ctx.canvas.setAttribute('willReadFrequently', 'true');
    }

    try {
      // Clear canvases
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      croppedCtx.clearRect(0, 0, croppedCanvas.width, croppedCanvas.height);
      
      // Draw full video frame to main canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get image data for blink analysis
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const blinkResult = detectBlinkFromPixels(imageData);
      
      setIsBlinking(blinkResult.isBlinking);
      setEyeOpenness(blinkResult.eyeOpenness);
      
      // Send eye data in EYE_DATA format compatible with SimplePeer
      if (sendData && typeof sendData === 'function') {
        const eyeDataMessage = {
          type: 'EYE_DATA',
          payload: {
            leftEyeOpenness: blinkResult.eyeOpenness,
            rightEyeOpenness: blinkResult.eyeOpenness,
            isBlinking: blinkResult.isBlinking,
            isFaceCentered: true, // Assume face is centered for now
            timestamp: Date.now(),
            playerId: username
          }
        };
        
        sendData(eyeDataMessage);
        
        // Only log when blink state changes to reduce noise
        if (blinkResult.isBlinking !== lastBlinkState.current) {
          lastBlinkState.current = blinkResult.isBlinking;
          console.log('📡 Sent eye data:', blinkResult.isBlinking ? '😑 BLINK' : '👁️ OPEN', `(${blinkResult.eyeOpenness.toFixed(2)})`);
        }
      }
      
      // Create cropped eye region for opponent transmission
      const eyeRegion = getSimpleEyeRegion();
      const videoWidth = video.videoWidth || video.width;
      const videoHeight = video.videoHeight || video.height;
      
      croppedCtx.drawImage(
        video,
        eyeRegion.x * videoWidth,
        eyeRegion.y * videoHeight, 
        eyeRegion.width * videoWidth,
        eyeRegion.height * videoHeight,
        0, 0,
        croppedCanvas.width,
        croppedCanvas.height
      );
      
    } catch (error) {
      console.warn('Frame processing error:', error);
    }
  }, [videoRef, canvasRef, detectBlinkFromPixels, getSimpleEyeRegion, sendData, username]);

  // Start processing when everything is ready
  const startProcessing = useCallback(() => {
    if (!isReady || !videoRef.current) return;

    const animate = () => {
      processFrame();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
    console.log('🎯 Started optimal lightweight blink processing');
  }, [isReady, processFrame]);

  const stopProcessing = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  // Get cropped canvas stream for transmission (memoized)
  const [croppedStream, setCroppedStream] = useState<MediaStream | null>(null);
  
  useEffect(() => {
    if (croppedCanvasRef.current && isReady) {
      const stream = croppedCanvasRef.current.captureStream(20);
      setCroppedStream(stream);
    }
  }, [isReady]);

  // Handle incoming blink events from opponent
  const handleRemoteBlinkEvent = useCallback((event: BlinkEvent) => {
    setRemoteBlinkState(event.isBlinking);
    console.log('📨 Received opponent blink:', event.isBlinking ? '😑 BLINK' : '👁️ OPEN', `(${event.confidence.toFixed(2)} confidence)`);
  }, []);

  // Auto-handle messages from useSimplePeer
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'blink' && data.isBlinking !== undefined) {
          handleRemoteBlinkEvent(data);
        }
      } catch (error) {
        // Not a JSON message, ignore
      }
    };

    // Listen for WebRTC data channel messages
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleRemoteBlinkEvent]);

  // Auto-start processing when video is ready
  useEffect(() => {
    if (isReady && videoRef.current && videoRef.current.readyState >= 3) {
      console.log('🎯 Auto-starting optimal blink processing');
      startProcessing();
    }
    
    return stopProcessing;
  }, [isReady, startProcessing, stopProcessing]);

  // Listen for video ready state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      if (isReady) {
        console.log('📹 Video loaded, starting blink detection');
        startProcessing();
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    return () => video.removeEventListener('loadeddata', handleLoadedData);
  }, [videoRef, isReady, startProcessing]);

  return {
    // Local state
    isBlinking,
    eyeOpenness,
    faceDetected: true, // Simplified - assume face is detected
    isReady,
    latency: 0, // We don't measure latency in this version
    
    // Remote state
    remoteBlinkState,
    
    // Controls
    startProcessing,
    stopProcessing,
    croppedStream,
    handleRemoteBlinkEvent,
    
    // Canvas refs
    croppedCanvas: croppedCanvasRef.current
  };
};

export default useOptimalBlink;