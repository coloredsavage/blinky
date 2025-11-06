
import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { LEFT_EYE_INDICES, RIGHT_EYE_INDICES } from '../constants';
import { getEyesBoundingBox } from '../utils/faceDetection';

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


const analyzeLightingQuality = (videoElement: HTMLVideoElement): 'good' | 'poor' => {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'good';
    
    canvas.width = 100;
    canvas.height = 100;
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let totalBrightness = 0;
    let totalPixels = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
      totalBrightness += brightness;
      totalPixels++;
    }
    
    const averageBrightness = totalBrightness / totalPixels;
    
    // Consider lighting poor if average brightness is below 60 or above 240
    if (averageBrightness < 60 || averageBrightness > 240) {
      return 'poor';
    }
    
    return 'good';
  } catch (error) {
    console.warn('Failed to analyze lighting quality:', error);
    return 'good';
  }
};

interface UseFaceMeshOptions {
  blinkThreshold?: number;
}

const useFaceMesh = (
  videoRef: RefObject<HTMLVideoElement>, 
  canvasRef: RefObject<HTMLCanvasElement>,
  options: UseFaceMeshOptions = {}
) => {
  const { blinkThreshold = 0.25 } = options;
    const [isReady, setIsReady] = useState(false);
    const [leftEar, setLeftEar] = useState(0.4);
    const [rightEar, setRightEar] = useState(0.4);
    const [isFaceCentered, setIsFaceCentered] = useState(false);
    const [lightingQuality, setLightingQuality] = useState<'good' | 'poor'>('good');
    const [hasFace, setHasFace] = useState<boolean>(false);
    const [faceDetectionTime, setFaceDetectionTime] = useState<number | null>(null);
    const faceMeshRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const lightingCheckRef = useRef<NodeJS.Timeout | null>(null);
    const lastFaceDetectionRef = useRef<number>(0);

    const onResults = useCallback((results: any) => {
        if (!canvasRef.current || !videoRef.current) return;
        const canvasCtx = canvasRef.current.getContext('2d');
        if (!canvasCtx) return;

        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            // Update face detection time
            const currentTime = Date.now();
            lastFaceDetectionRef.current = currentTime;
            setHasFace(true);
            setFaceDetectionTime(currentTime);
            
            // Cropped eyes view
            const box = getEyesBoundingBox(landmarks);
            if(box) {
                const w = canvasRef.current.width;
                const h = canvasRef.current.height;
                const padX = 0.08;
                const padY = 0.12;
                let x = Math.max(0, (box.minX - padX) * w);
                let y = Math.max(0, (box.minY - padY) * h);
                let width = Math.min(w, (box.maxX - box.minX + 2 * padX) * w);
                let height = Math.min(h, (box.maxY - box.minY + 2 * padY) * h);

                canvasCtx.fillStyle = '#000000'; // True black background
                canvasCtx.fillRect(0, 0, w, h);
                canvasCtx.drawImage(videoRef.current, x, y, width, height, 0, 0, w, h);
            }
            
            const nose = landmarks[1];
            if (nose) setIsFaceCentered(nose.x > 0.35 && nose.x < 0.65 && nose.y > 0.2 && nose.y < 0.8);
            
            setLeftEar(getEAR(landmarks, LEFT_EYE_INDICES));
            setRightEar(getEAR(landmarks, RIGHT_EYE_INDICES));
        } else {
            setIsFaceCentered(false);
            setHasFace(false);
        }
        canvasCtx.restore();
    }, [canvasRef, videoRef]);

    const startFaceMesh = useCallback(() => {
        if (faceMeshRef.current && cameraRef.current) {
            cameraRef.current.start();
            
            // Start periodic lighting quality checks
            if (lightingCheckRef.current) {
                clearInterval(lightingCheckRef.current);
            }
            
            lightingCheckRef.current = setInterval(() => {
                if (videoRef.current && videoRef.current.readyState === 4) {
                    const quality = analyzeLightingQuality(videoRef.current);
                    setLightingQuality(quality);
                }
            }, 2000); // Check every 2 seconds
        }
    }, []);

    const stopFaceMesh = useCallback(() => {
        if (cameraRef.current) {
            cameraRef.current.stop();
        }
        if (lightingCheckRef.current) {
            clearInterval(lightingCheckRef.current);
            lightingCheckRef.current = null;
        }
    }, []);
    
    useEffect(() => {
        if (!videoRef.current) return;

        // Prevent multiple instances
        if (faceMeshRef.current) {
            console.log('[useFaceMesh] MediaPipe already initialized, skipping');
            return;
        }

        const faceMesh = new (window as any).FaceMesh({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        faceMesh.onResults(onResults);
        faceMeshRef.current = faceMesh;

        const camera = new (window as any).Camera(videoRef.current, {
            onFrame: async () => {
                if (videoRef.current && faceMeshRef.current) {
                    try {
                        await faceMesh.send({ image: videoRef.current });
                    } catch (error) {
                        console.error('[useFaceMesh] Error processing frame:', error);
                    }
                }
            },
            width: 640,
            height: 480
        });
        cameraRef.current = camera;
        setIsReady(true);

        return () => {
            console.log('[useFaceMesh] Cleanup: stopping camera and closing MediaPipe');
            stopFaceMesh();
            if (faceMeshRef.current) {
                faceMeshRef.current.close();
                faceMeshRef.current = null;
            }
            if (cameraRef.current) {
                cameraRef.current = null;
            }
        };
    }, [onResults, videoRef, stopFaceMesh]);

    return { 
        isReady, 
        leftEar, 
        rightEar, 
        isFaceCentered, 
        lightingQuality, 
        hasFace,
        faceDetectionTime,
        lastFaceDetectionTime: lastFaceDetectionRef.current,
        blinkThreshold,
        startFaceMesh, 
        stopFaceMesh 
    };
};

export default useFaceMesh;
