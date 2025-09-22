
import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { LEFT_EYE_INDICES, RIGHT_EYE_INDICES } from '../constants';

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

const getFaceBoundingBox = (landmarks: any[]) => {
  if (!landmarks || landmarks.length === 0) return null;
  
  // Use all face landmarks to get full face bounds
  const points = landmarks.filter(Boolean);
  if (points.length === 0) return null;
  
  let minX = Math.min(...points.map(p => p.x));
  let maxX = Math.max(...points.map(p => p.x));
  let minY = Math.min(...points.map(p => p.y));
  let maxY = Math.max(...points.map(p => p.y));

  // Calculate face center
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  // Calculate face dimensions
  const width = maxX - minX;
  const height = maxY - minY;

  return { 
    center: { x: centerX, y: centerY },
    bounds: { width, height },
    box: { minX, maxX, minY, maxY }
  };
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

const useFaceMesh = (videoRef: RefObject<HTMLVideoElement>, canvasRef: RefObject<HTMLCanvasElement>) => {
    const [isReady, setIsReady] = useState(false);
    const [leftEar, setLeftEar] = useState(0.4);
    const [rightEar, setRightEar] = useState(0.4);
    const [isFaceCentered, setIsFaceCentered] = useState(false);
    const [lightingQuality, setLightingQuality] = useState<'good' | 'poor'>('good');
    const [landmarks, setLandmarks] = useState<any[] | null>(null);
    const [eyesBoundingBox, setEyesBoundingBox] = useState<{
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    } | null>(null);
    const [faceBoundingBox, setFaceBoundingBox] = useState<{
        center: { x: number; y: number };
        bounds: { width: number; height: number };
        box: { minX: number; maxX: number; minY: number; maxY: number };
    } | null>(null);
    const faceMeshRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const lightingCheckRef = useRef<NodeJS.Timeout | null>(null);
    const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const onResults = useCallback((results: any) => {
        if (!canvasRef.current || !videoRef.current) return;
        if (videoRef.current.readyState !== 4 || videoRef.current.videoWidth === 0) return;
        
        const canvasCtx = canvasRef.current.getContext('2d');
        if (!canvasCtx) return;

        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        // Track when onResults is called for monitoring (use a reasonable timestamp)
        (window as any).lastOnResultsCall = Date.now();

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const detectedLandmarks = results.multiFaceLandmarks[0];
            
            // Track last successful detection (use a reasonable timestamp)
            (window as any).lastFaceDetectionTime = Date.now();
            (window as any).currentLandmarks = detectedLandmarks; // Store current landmarks
            
            // Store landmarks for sharing with opponents
            setLandmarks(detectedLandmarks);
            
            // Calculate face center and bounding box for opponent tracking
            const faceBox = getFaceBoundingBox(detectedLandmarks);
            setFaceBoundingBox(faceBox);
            
            // Cropped eyes view
            const box = getEyesBoundingBox(detectedLandmarks);
            if(box) {
                // Store the eye bounding box for hybrid transmission
                setEyesBoundingBox(box);
                
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
            } else {
                setEyesBoundingBox(null);
            }
            
            const nose = detectedLandmarks[1];
            if (nose) setIsFaceCentered(nose.x > 0.35 && nose.x < 0.65 && nose.y > 0.2 && nose.y < 0.8);
            
            setLeftEar(getEAR(detectedLandmarks, LEFT_EYE_INDICES));
            setRightEar(getEAR(detectedLandmarks, RIGHT_EYE_INDICES));
        } else {
            console.log('🚫 onResults called with NO face detected - clearing landmarks');
            (window as any).currentLandmarks = null;
            setIsFaceCentered(false);
            setLandmarks(null);
            setEyesBoundingBox(null);
            setFaceBoundingBox(null);
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
            
            // Start monitoring for stuck landmarks - independent of MediaPipe callbacks
            if (monitoringIntervalRef.current) {
                clearInterval(monitoringIntervalRef.current);
            }
            
            // Initialize monitoring timestamps
            (window as any).lastOnResultsCall = Date.now();
            (window as any).lastFaceDetectionTime = 0;
            (window as any).lastForcedCheck = Date.now();
            
            monitoringIntervalRef.current = setInterval(() => {
                const now = Date.now();
                const lastOnResults = (window as any).lastOnResultsCall || now;
                const lastFaceDetection = (window as any).lastFaceDetectionTime || 0;
                const lastForcedCheck = (window as any).lastForcedCheck || now;
                const currentLandmarks = (window as any).currentLandmarks;
                
                // Calculate reasonable time differences
                const timeSinceOnResults = Math.min(now - lastOnResults, 999999); // Cap at reasonable value
                const timeSinceFaceDetection = lastFaceDetection > 0 ? Math.min(now - lastFaceDetection, 999999) : 0;
                const timeSinceLastCheck = Math.min(now - lastForcedCheck, 999999);
                
                console.log('🔍 Monitoring:', {
                    timeSinceOnResults: Math.round(timeSinceOnResults / 1000) + 's',
                    timeSinceFaceDetection: Math.round(timeSinceFaceDetection / 1000) + 's',
                    hasCurrentLandmarks: !!currentLandmarks,
                    landmarkCount: currentLandmarks ? currentLandmarks.length : 0
                });
                
                // Simple backup check - only clear if landmarks are very old
                if (currentLandmarks && lastFaceDetection > 0 && (now - lastFaceDetection > 3000)) {
                    console.log('⚠️ Clearing old landmarks after 3s without update');
                    setLandmarks(null);
                    setIsFaceCentered(false);
                    setEyesBoundingBox(null);
                    (window as any).lastFaceDetectionTime = 0;
                    (window as any).currentLandmarks = null;
                }
                
                // Legacy monitoring as backup
                if (timeSinceOnResults > 5000) {
                    console.log('⚠️ MediaPipe onResults not called for 5s - emergency restart');
                    setLandmarks(null);
                    setIsFaceCentered(false);
                    setEyesBoundingBox(null);
                    (window as any).lastOnResultsCall = now;
                    (window as any).lastFaceDetectionTime = 0;
                    (window as any).currentLandmarks = null;
                }
            }, 3000); // Check every 3 seconds
            
            // Use setInterval instead of setTimeout to prevent throttling
            (window as any).keepAliveInterval = setInterval(() => {
                // Keep background tab active by doing minimal work
                const now = Date.now();
                (window as any).lastKeepAlive = now;
            }, 1000);
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
        if (monitoringIntervalRef.current) {
            clearInterval(monitoringIntervalRef.current);
            monitoringIntervalRef.current = null;
        }
        if ((window as any).keepAliveInterval) {
            clearInterval((window as any).keepAliveInterval);
            (window as any).keepAliveInterval = null;
        }
    }, []);
    
    // Browser-specific MediaPipe handling
    useEffect(() => {
        const isChrome = /Chrome/.test(navigator.userAgent) && !/Chromium/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        const handleVisibilityChange = () => {
            if (document.hidden) {
                console.log('⚠️ Tab went to background - keeping MediaPipe active');
                if (faceMeshRef.current && cameraRef.current) {
                    setTimeout(() => {
                        if (cameraRef.current) {
                            cameraRef.current.start();
                        }
                    }, 100);
                }
            } else {
                console.log('✅ Tab returned to foreground - browser-specific MediaPipe refresh');
                
                if (isChrome) {
                    // Chrome needs aggressive restart for face detection recovery
                    console.log('🟡 Chrome detected - forcing camera restart for face detection recovery');
                    if (cameraRef.current) {
                        try {
                            cameraRef.current.stop();
                            setTimeout(() => {
                                if (cameraRef.current) {
                                    cameraRef.current.start();
                                    (window as any).lastOnResultsCall = Date.now();
                                    (window as any).lastFaceDetectionTime = 0;
                                }
                            }, 300); // Longer delay for Chrome
                        } catch (error) {
                            console.warn('Chrome camera restart failed:', error);
                        }
                    }
                } else if (isSafari) {
                    // Safari needs gentle restart
                    console.log('🍎 Safari detected - gentle camera refresh');
                    if (cameraRef.current) {
                        try {
                            setTimeout(() => {
                                if (cameraRef.current) {
                                    cameraRef.current.start();
                                }
                            }, 100);
                        } catch (error) {
                            console.warn('Safari camera refresh failed:', error);
                        }
                    }
                } else {
                    // Standard handling for Chromium and others
                    console.log('🔵 Standard browser - normal visibility handling');
                    if (cameraRef.current) {
                        try {
                            cameraRef.current.start();
                            (window as any).lastOnResultsCall = Date.now();
                            (window as any).lastFaceDetectionTime = 0;
                        } catch (error) {
                            console.warn('Standard camera restart failed:', error);
                        }
                    }
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Chrome-specific: Add periodic face detection recovery check
        let chromeRecoveryInterval;
        if (isChrome) {
            chromeRecoveryInterval = setInterval(() => {
                const now = Date.now();
                const lastOnResults = (window as any).lastOnResultsCall || now;
                const currentLandmarks = (window as any).currentLandmarks;
                
                // If Chrome hasn't had face detection for 3 seconds, force restart
                if (now - lastOnResults > 3000 && !currentLandmarks) {
                    console.log('🟡 Chrome face detection recovery - forcing restart');
                    if (cameraRef.current) {
                        try {
                            cameraRef.current.stop();
                            setTimeout(() => {
                                if (cameraRef.current) {
                                    cameraRef.current.start();
                                    (window as any).lastOnResultsCall = Date.now();
                                }
                            }, 200);
                        } catch (error) {
                            console.warn('Chrome recovery restart failed:', error);
                        }
                    }
                }
            }, 5000); // Check every 5 seconds
        }
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (chromeRecoveryInterval) {
                clearInterval(chromeRecoveryInterval);
            }
        };
    }, []);

    useEffect(() => {
        if (!videoRef.current) return;
        
        // Check if MediaPipe libraries are loaded
        console.log('🔍 MediaPipe availability check:', {
            FaceMesh: typeof (window as any).FaceMesh,
            Camera: typeof (window as any).Camera,
            availableGlobals: Object.keys(window).filter(k => k.includes('Face') || k.includes('Camera') || k.includes('MediaPipe'))
        });
        
        if (typeof (window as any).FaceMesh === 'undefined') {
            console.error('❌ MediaPipe FaceMesh not loaded. Check CDN loading.');
            console.error('🔍 Available window properties:', Object.keys(window).slice(0, 20));
            return;
        }
        
        if (typeof (window as any).Camera === 'undefined') {
            console.error('❌ MediaPipe Camera not loaded. Check CDN loading.');
            console.error('🔍 Available window properties:', Object.keys(window).slice(0, 20));
            return;
        }
        
        try {
            const faceMesh = new (window as any).FaceMesh({
                locateFile: (file: string) => {
                    const jsDelivrUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
                    console.log(`🔍 Loading MediaPipe asset: ${file} from ${jsDelivrUrl}`);
                    return jsDelivrUrl;
                },
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
                    if (videoRef.current && 
                        videoRef.current.readyState === 4 && 
                        videoRef.current.videoWidth > 0 && 
                        videoRef.current.videoHeight > 0) {
                        try {
                            await faceMesh.send({ image: videoRef.current });
                        } catch (error) {
                            console.warn('Face mesh processing error:', error);
                        }
                    }
                },
                width: 640,
                height: 480
            });
            cameraRef.current = camera;
            setIsReady(true);
            console.log('✅ MediaPipe FaceMesh initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize MediaPipe FaceMesh:', error);
            setIsReady(false);
        }

        return () => {
            stopFaceMesh();
        };
    }, [videoRef]); // Only depend on videoRef, not callback functions

    return { isReady, leftEar, rightEar, isFaceCentered, lightingQuality, landmarks, eyesBoundingBox, faceBoundingBox, startFaceMesh, stopFaceMesh };
};

export default useFaceMesh;
