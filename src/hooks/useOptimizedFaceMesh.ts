import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { LEFT_EYE_INDICES, RIGHT_EYE_INDICES, BLINK_THRESHOLD } from '../constants';

// Declare MediaPipe globals from CDN
declare const FaceMesh: any;
declare const Camera: any;

const euclidean = (p1: any, p2: any) => {
    if (!p1 || !p2) return 0;
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
};

const getEAR = (landmarks: any[], eyeIndices: { [key: string]: number }) => {
    if (!landmarks) return 0.4;
    try {
        const outer = landmarks[eyeIndices.outer];
        const inner = landmarks[eyeIndices.inner];
        const top1 = landmarks[eyeIndices.top1];
        const bottom1 = landmarks[eyeIndices.bottom1];
        const top2 = landmarks[eyeIndices.top2];
        const bottom2 = landmarks[eyeIndices.bottom2];

        if (!outer || !inner || !top1 || !bottom1 || !top2 || !bottom2) return 0.4;

        const vertical1 = euclidean(top1, bottom1);
        const vertical2 = euclidean(top2, bottom2);
        const horizontal = euclidean(outer, inner);

        if (horizontal === 0) return 0.4;

        const ear = (vertical1 + vertical2) / (2.0 * horizontal);
        return Math.max(0, Math.min(1, ear));
    } catch {
        return 0.4;
    }
};

const getEyesBoundingBox = (landmarks: any[]) => {
  const allIndices = [...Object.values(LEFT_EYE_INDICES), ...Object.values(RIGHT_EYE_INDICES)];
  const points = allIndices.map(i => landmarks[i]).filter(Boolean);
  if (points.length === 0) return null;
  
  let minX = Math.min(...points.map(p => p.x));
  let maxX = Math.max(...points.map(p => p.x));
  let minY = Math.min(...points.map(p => p.y));
  let maxY = Math.max(...points.map(p => p.y));

  return { minX, maxX, minY, maxY };
};

interface BlinkEvent {
  type: 'blink';
  isBlinking: boolean;
  timestamp: number;
  leftEar: number;
  rightEar: number;
}

interface OptimizedFaceMeshConfig {
  mode: 'local' | 'remote';  // local = full processing, remote = light processing
  onBlinkDetected?: (event: BlinkEvent) => void;  // Send blink events to opponent
  username: string;
}

const useOptimizedFaceMesh = (
  videoRef: RefObject<HTMLVideoElement>, 
  canvasRef: RefObject<HTMLCanvasElement>,
  config: OptimizedFaceMeshConfig
) => {
    const [isReady, setIsReady] = useState(false);
    const [leftEar, setLeftEar] = useState(0.4);
    const [rightEar, setRightEar] = useState(0.4);
    const [isFaceCentered, setIsFaceCentered] = useState(false);
    const [landmarks, setLandmarks] = useState<any[] | null>(null);
    const [isBlinking, setIsBlinking] = useState(false);
    const [croppedVideoStream, setCroppedVideoStream] = useState<MediaStream | null>(null);
    
    const faceMeshRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const lastBlinkState = useRef(false);

    const onResults = useCallback((results: any) => {
        if (!canvasRef.current || !videoRef.current) return;
        if (videoRef.current.readyState !== 4 || videoRef.current.videoWidth === 0) return;
        
        const canvasCtx = canvasRef.current.getContext('2d');
        if (!canvasCtx) return;

        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const detectedLandmarks = results.multiFaceLandmarks[0];
            setLandmarks(detectedLandmarks);
            
            // Face cropping (same as single player)
            const box = getEyesBoundingBox(detectedLandmarks);
            if(box) {
                const w = canvasRef.current.width;
                const h = canvasRef.current.height;
                const padX = 0.08;
                const padY = 0.12;
                let x = Math.max(0, (box.minX - padX) * w);
                let y = Math.max(0, (box.minY - padY) * h);
                let width = Math.min(w, (box.maxX - box.minX + 2 * padX) * w);
                let height = Math.min(h, (box.maxY - box.minY + 2 * padY) * h);

                canvasCtx.fillStyle = '#000000';
                canvasCtx.fillRect(0, 0, w, h);
                canvasCtx.drawImage(videoRef.current, x, y, width, height, 0, 0, w, h);
                
                // Create cropped video stream from canvas
                const stream = canvasRef.current.captureStream(15);
                setCroppedVideoStream(stream);
            }
            
            // Face centering detection
            const nose = detectedLandmarks[1];
            if (nose) {
                setIsFaceCentered(nose.x > 0.35 && nose.x < 0.65 && nose.y > 0.2 && nose.y < 0.8);
            }
            
            // EAR calculation (always done for UI display)
            const currentLeftEar = getEAR(detectedLandmarks, LEFT_EYE_INDICES);
            const currentRightEar = getEAR(detectedLandmarks, RIGHT_EYE_INDICES);
            setLeftEar(currentLeftEar);
            setRightEar(currentRightEar);
            
            // BLINK DETECTION: Only for local mode (heavy processing)
            if (config.mode === 'local') {
                const currentlyBlinking = currentLeftEar < BLINK_THRESHOLD && currentRightEar < BLINK_THRESHOLD;
                setIsBlinking(currentlyBlinking);
                
                // Send blink events when state changes
                if (currentlyBlinking !== lastBlinkState.current && config.onBlinkDetected) {
                    const blinkEvent: BlinkEvent = {
                        type: 'blink',
                        isBlinking: currentlyBlinking,
                        timestamp: Date.now(),
                        leftEar: currentLeftEar,
                        rightEar: currentRightEar
                    };
                    config.onBlinkDetected(blinkEvent);
                    console.log(`👁️ ${config.username} blink event:`, currentlyBlinking ? '😑' : '👁️');
                }
                lastBlinkState.current = currentlyBlinking;
            }
            // Remote mode: No blink detection, just face tracking
            
        } else {
            setIsFaceCentered(false);
            setLandmarks(null);
        }
        canvasCtx.restore();
    }, [canvasRef, videoRef, config]);

    // Initialize MediaPipe
    useEffect(() => {
        if (typeof FaceMesh === 'undefined' || typeof Camera === 'undefined') {
            console.warn('MediaPipe not loaded');
            return;
        }

        const faceMesh = new FaceMesh({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults(onResults);
        faceMeshRef.current = faceMesh;

        if (videoRef.current) {
            const camera = new Camera(videoRef.current, {
                onFrame: async () => {
                    if (faceMeshRef.current) {
                        await faceMeshRef.current.send({ image: videoRef.current });
                    }
                },
                width: 1280,
                height: 720
            });
            cameraRef.current = camera;
        }

        setIsReady(true);
    }, [onResults, videoRef]);

    const startProcessing = useCallback(() => {
        if (cameraRef.current) {
            console.log(`🎯 Starting ${config.mode} face processing for ${config.username}`);
            cameraRef.current.start();
        }
    }, [config]);

    const stopProcessing = useCallback(() => {
        if (cameraRef.current) {
            console.log(`🛑 Stopping ${config.mode} face processing for ${config.username}`);
            cameraRef.current.stop();
        }
    }, [config]);

    // Cleanup
    useEffect(() => {
        return () => {
            stopProcessing();
        };
    }, [stopProcessing]);

    return {
        // State
        isReady,
        leftEar,
        rightEar,
        isFaceCentered,
        landmarks,
        isBlinking, // Only accurate in local mode
        croppedVideoStream,
        
        // Actions
        startProcessing,
        stopProcessing,
        
        // Config
        mode: config.mode
    };
};

export default useOptimizedFaceMesh;