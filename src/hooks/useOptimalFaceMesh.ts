import { useRef, useEffect, useState, useCallback } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

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

interface OptimalFaceMeshReturn {
  // Video elements
  videoRef: React.RefObject<HTMLVideoElement>;
  croppedCanvasRef: React.RefObject<HTMLCanvasElement>;
  
  // States
  isProcessing: boolean;
  lastBlinkState: boolean;
  blinkCount: number;
  confidence: number;
  
  // Streams for opponent
  croppedVideoStream: MediaStream | null;
  
  // Event handlers
  onBlinkDetected: (callback: (event: BlinkEvent) => void) => void;
  
  // Control
  startProcessing: () => void;
  stopProcessing: () => void;
}

const useOptimalFaceMesh = (playerId: string): OptimalFaceMeshReturn => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const croppedCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastBlinkState, setLastBlinkState] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [croppedVideoStream, setCroppedVideoStream] = useState<MediaStream | null>(null);
  
  const blinkCallbackRef = useRef<((event: BlinkEvent) => void) | null>(null);
  const lastBlinkTimeRef = useRef<number>(0);
  const initializingRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  
  // Eye landmark indices for MediaPipe
  const LEFT_EYE_LANDMARKS = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const RIGHT_EYE_LANDMARKS = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
  
  // Calculate Eye Aspect Ratio (EAR) for blink detection
  const calculateEAR = useCallback((landmarks: any[], eyeIndices: number[]) => {
    const eyePoints = eyeIndices.map(idx => landmarks[idx]);
    
    // Vertical distances
    const v1 = Math.sqrt(
      Math.pow(eyePoints[1].x - eyePoints[5].x, 2) + 
      Math.pow(eyePoints[1].y - eyePoints[5].y, 2)
    );
    const v2 = Math.sqrt(
      Math.pow(eyePoints[2].x - eyePoints[4].x, 2) + 
      Math.pow(eyePoints[2].y - eyePoints[4].y, 2)
    );
    
    // Horizontal distance
    const h = Math.sqrt(
      Math.pow(eyePoints[0].x - eyePoints[3].x, 2) + 
      Math.pow(eyePoints[0].y - eyePoints[3].y, 2)
    );
    
    return (v1 + v2) / (2.0 * h);
  }, []);
  
  // Get eye region for cropping
  const getEyeRegion = useCallback((landmarks: any[], videoWidth: number, videoHeight: number): EyeRegion => {
    const allEyePoints = [...LEFT_EYE_LANDMARKS, ...RIGHT_EYE_LANDMARKS]
      .map(idx => landmarks[idx]);
    
    const minX = Math.min(...allEyePoints.map(p => p.x * videoWidth));
    const maxX = Math.max(...allEyePoints.map(p => p.x * videoWidth));
    const minY = Math.min(...allEyePoints.map(p => p.y * videoHeight));
    const maxY = Math.max(...allEyePoints.map(p => p.y * videoHeight));
    
    // Add padding
    const padding = 40;
    const x = Math.max(0, minX - padding);
    const y = Math.max(0, minY - padding);
    const width = Math.min(videoWidth - x, maxX - minX + 2 * padding);
    const height = Math.min(videoHeight - y, maxY - minY + 2 * padding);
    
    return { x, y, width, height };
  }, []);
  
  // Process frame and detect blinks
  const processFrame = useCallback((results: any) => {
    if (!results.multiFaceLandmarks || !results.multiFaceLandmarks[0]) {
      setConfidence(0);
      return;
    }
    
    const landmarks = results.multiFaceLandmarks[0];
    const video = videoRef.current;
    const canvas = croppedCanvasRef.current;
    
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Calculate blink detection
    const leftEAR = calculateEAR(landmarks, LEFT_EYE_LANDMARKS);
    const rightEAR = calculateEAR(landmarks, RIGHT_EYE_LANDMARKS);
    const avgEAR = (leftEAR + rightEAR) / 2;
    
    // Blink threshold (lower = more closed)
    const BLINK_THRESHOLD = 0.2;
    const isBlinking = avgEAR < BLINK_THRESHOLD;
    const blinkConfidence = Math.max(0, Math.min(1, (BLINK_THRESHOLD - avgEAR) / BLINK_THRESHOLD));
    
    setConfidence(blinkConfidence);
    
    // Detect blink state change
    if (isBlinking !== lastBlinkState) {
      const now = performance.now();
      
      // Debounce rapid changes (minimum 100ms between blinks)
      if (now - lastBlinkTimeRef.current > 100) {
        setLastBlinkState(isBlinking);
        lastBlinkTimeRef.current = now;
        
        if (isBlinking) {
          setBlinkCount(prev => prev + 1);
        }
        
        // Send blink event
        if (blinkCallbackRef.current) {
          const blinkEvent: BlinkEvent = {
            type: 'blink',
            isBlinking,
            timestamp: now,
            playerId,
            confidence: blinkConfidence
          };
          blinkCallbackRef.current(blinkEvent);
        }
      }
    }
    
    // Crop and draw eye region to canvas
    const eyeRegion = getEyeRegion(landmarks, video.videoWidth, video.videoHeight);
    
    // Set canvas size to match eye region aspect ratio
    const aspectRatio = eyeRegion.width / eyeRegion.height;
    canvas.width = 320;
    canvas.height = 320 / aspectRatio;
    
    // Draw cropped eye region
    ctx.drawImage(
      video,
      eyeRegion.x, eyeRegion.y, eyeRegion.width, eyeRegion.height,
      0, 0, canvas.width, canvas.height
    );
    
    // Draw blink indicator overlay
    if (isBlinking) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('BLINK!', canvas.width / 2, canvas.height / 2);
    }
  }, [calculateEAR, getEyeRegion, lastBlinkState, playerId]);
  
  // Initialize MediaPipe FaceMesh
  useEffect(() => {
    let mounted = true;
    
    const initializeFaceMesh = async () => {
      try {
        console.log('🧠 Initializing MediaPipe FaceMesh...');
        
        // Clear any existing instance first
        if (faceMeshRef.current) {
          try {
            faceMeshRef.current.close();
          } catch (e) {
            console.warn('Warning cleaning up previous FaceMesh:', e);
          }
          faceMeshRef.current = null;
        }
        
        // Small delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!mounted) return;
        
        const faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (!mounted) {
          try {
            faceMesh.close();
          } catch (e) {}
          return;
        }
        
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        faceMesh.onResults(processFrame);
        
        // Only set if still mounted
        if (mounted) {
          faceMeshRef.current = faceMesh;
          console.log('✅ Optimal FaceMesh initialized for local processing only');
        } else {
          try {
            faceMesh.close();
          } catch (e) {}
        }
      } catch (error) {
        console.error('❌ Failed to initialize FaceMesh:', error);
        if (mounted) {
          faceMeshRef.current = null;
        }
      }
    };
    
    initializeFaceMesh();
    
    return () => {
      mounted = false;
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close();
        } catch (e) {
          console.warn('Warning cleaning up FaceMesh on unmount:', e);
        }
        faceMeshRef.current = null;
      }
    };
  }, [processFrame]);
  
  // Start processing
  const startProcessing = useCallback(async () => {
    if (isProcessing || initializingRef.current || !mountedRef.current) {
      console.log('🛑 StartProcessing blocked - already running or not mounted');
      return;
    }
    
    initializingRef.current = true;
    
    try {
      console.log('🎥 Starting camera and MediaPipe initialization...');
      
      // Step 1: Stop any existing processing first
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      
      // Step 2: Wait for MediaPipe to be ready
      if (!faceMeshRef.current) {
        console.log('⏳ Waiting for MediaPipe to initialize...');
        // Give MediaPipe a moment to fully initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!faceMeshRef.current) {
          throw new Error('MediaPipe not initialized');
        }
      }
      
      // Step 3: Get user media
      console.log('📹 Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false
      });
      
      // Step 4: Set up video element
      if (!videoRef.current) {
        throw new Error('Video element not available');
      }
      
      videoRef.current.srcObject = stream;
      
      // Wait for video metadata to load before playing
      await new Promise((resolve, reject) => {
        if (!videoRef.current) return reject(new Error('Video ref lost'));
        
        const video = videoRef.current;
        
        const onLoadedMetadata = () => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          resolve(undefined);
        };
        
        const onError = (error: any) => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          reject(new Error(`Video load error: ${error}`));
        };
        
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('error', onError);
      });
      
      // Step 5: Play video
      console.log('▶️ Starting video playback...');
      await videoRef.current.play();
      
      // Step 6: Set processing flag early to prevent camera init conflicts
      setIsProcessing(true);
      
      // Step 7: Initialize MediaPipe Camera with delay
      console.log('🔄 Setting up MediaPipe camera...');
      await new Promise(resolve => setTimeout(resolve, 500)); // Let video settle
      
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (faceMeshRef.current && isProcessing && videoRef.current) {
            try {
              await faceMeshRef.current.send({ image: videoRef.current });
            } catch (error) {
              console.warn('⚠️ MediaPipe frame processing warning:', error);
            }
          }
        },
        width: 1280,
        height: 720
      });
      
      cameraRef.current = camera;
      camera.start();
      
      // Step 8: Set up canvas stream after everything is running
      await new Promise(resolve => setTimeout(resolve, 1000)); // Let processing start
      
      if (croppedCanvasRef.current) {
        const canvasStream = croppedCanvasRef.current.captureStream(20);
        setCroppedVideoStream(canvasStream);
        console.log('📺 Canvas stream created');
      }
      
      console.log('✅ Optimal face processing started successfully');
    } catch (error) {
      console.error('❌ Failed to start camera:', error);
      setIsProcessing(false);
      
      // Clean up on error
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    } finally {
      initializingRef.current = false;
    }
  }, []);
  
  // Stop processing
  const stopProcessing = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    
    setIsProcessing(false);
    setCroppedVideoStream(null);
    console.log('✅ Stopped optimal face processing');
  }, []);
  
  // Set blink event callback
  const onBlinkDetected = useCallback((callback: (event: BlinkEvent) => void) => {
    blinkCallbackRef.current = callback;
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      console.log('🧹 OptimalFaceMesh: Unmounting and cleaning up...');
      mountedRef.current = false;
      initializingRef.current = false;
      stopProcessing();
    };
  }, [stopProcessing]);
  
  return {
    videoRef,
    croppedCanvasRef,
    isProcessing,
    lastBlinkState,
    blinkCount,
    confidence,
    croppedVideoStream,
    onBlinkDetected,
    startProcessing,
    stopProcessing
  };
};

export default useOptimalFaceMesh;