import React, { RefObject, useEffect, useCallback, useState, useMemo } from 'react';

interface MultiplayerVideoFeedProps {
    videoRef: RefObject<HTMLVideoElement>;
    canvasRef?: RefObject<HTMLCanvasElement>;
    username: string;
    isLocal?: boolean;
    remoteStream?: MediaStream | null;
    isFaceVisible?: boolean;
    landmarkCount?: number;
    faceCentered?: boolean;
    faceCenter?: { x: number; y: number } | null;
    faceBounds?: { width: number; height: number } | null;
}

const MultiplayerVideoFeed: React.FC<MultiplayerVideoFeedProps> = ({ 
    videoRef, 
    canvasRef, 
    username, 
    isLocal = false,
    remoteStream, 
    isFaceVisible = true,
    landmarkCount = 0,
    faceCentered = false,
    faceCenter = null,
    faceBounds = null
}) => {
    const [safetyStatus, setSafetyStatus] = useState<'safe' | 'unsafe' | 'checking'>('checking');
    const [videoStatus, setVideoStatus] = useState<string>('initializing');
    const [faceStatus, setFaceStatus] = useState<string>('unknown');
    const [lastUpdate, setLastUpdate] = useState<number>(0);
    
    
    useEffect(() => {
        if (!isLocal && remoteStream && isFaceVisible) {
            // Browser detection for specific handling
            const isChrome = /Chrome/.test(navigator.userAgent) && !/Chromium/.test(navigator.userAgent);
            const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
            const isChromium = /Chromium/.test(navigator.userAgent);
            
            console.log('🌐 Browser detection:', { isChrome, isSafari, isChromium });
            console.log('🌐 User agent:', navigator.userAgent);
            
            // Wait for video element to be available
            const checkVideoElement = () => {
                if (!videoRef.current) {
                    setVideoStatus('waiting-for-element');
                    // Try again after a short delay
                    setTimeout(checkVideoElement, 50);
                    return;
                }
                
                const video = videoRef.current;
                setVideoStatus('setting-stream');
                
                console.log('🎥 Setting remoteStream to video element:', remoteStream.id, 'tracks:', remoteStream.getTracks().length);
                
                // Browser-specific video stream handling
                if (isSafari) {
                    // Safari requires more aggressive stream management
                    console.log('🍎 Safari detected - using enhanced stream handling');
                    video.srcObject = null; // Clear first
                    setTimeout(() => {
                        video.srcObject = remoteStream;
                        video.load(); // Force reload
                        setTimeout(() => {
                            video.play().catch(err => console.warn('Safari play failed:', err));
                        }, 100);
                    }, 50);
                } else if (isChrome) {
                    // Chrome needs stream refresh for face detection recovery
                    console.log('🟡 Chrome detected - using refresh-friendly stream handling');
                    video.srcObject = remoteStream;
                    // Force stream refresh periodically for Chrome
                    const refreshInterval = setInterval(() => {
                        if (video.srcObject === remoteStream && isFaceVisible) {
                            const tracks = remoteStream.getTracks();
                            if (tracks.length > 0 && tracks[0].readyState === 'live') {
                                video.load(); // Refresh video element
                            }
                        } else {
                            clearInterval(refreshInterval);
                        }
                    }, 2000);
                } else {
                    // Standard handling for Chromium and other browsers
                    console.log('🔵 Standard browser - using default stream handling');
                    video.srcObject = remoteStream;
                }
                
                video.onloadedmetadata = () => {
                    setVideoStatus('metadata-loaded');
                    console.log('🎥 Video metadata loaded, attempting play...');
                    video.play()
                        .then(() => {
                            setVideoStatus('playing');
                            console.log('🎥 Video playing successfully');
                        })
                        .catch((error) => {
                            setVideoStatus('play-failed');
                            console.error('🎥 Video play failed:', error);
                            
                            // Retry for Safari
                            if (isSafari) {
                                setTimeout(() => {
                                    video.play().catch(e => console.warn('Safari retry failed:', e));
                                }, 500);
                            }
                        });
                };
                
                video.onplay = () => setVideoStatus('playing');
                video.onpause = () => setVideoStatus('paused');
                video.onerror = (error) => {
                    setVideoStatus('error');
                    console.error('🎥 Video error:', error);
                };
            };
            
            checkVideoElement();
        } else if (!isLocal && !remoteStream) {
            setVideoStatus('no-stream');
        } else if (!isLocal && remoteStream && !isFaceVisible) {
            setVideoStatus('face-not-visible');
        }
    }, [remoteStream, isLocal, isFaceVisible]);

    // Track face visibility changes for debugging
    useEffect(() => {
        if (!isLocal) {
            setLastUpdate(Date.now());
            if (isFaceVisible) {
                setFaceStatus('visible-received');
            } else {
                setFaceStatus('hidden-received');
            }
        }
    }, [isFaceVisible, isLocal, landmarkCount]); // Add landmarkCount to track data changes

    // Handle face visibility changes and keep video playing when visible
    useEffect(() => {
        if (!isLocal && isFaceVisible && videoRef.current && remoteStream) {
            const video = videoRef.current;
            setFaceStatus('visible-processing');
            
            // Always try to ensure video is playing when face is visible
            const ensureVideoPlaying = () => {
                if (video.paused && video.srcObject === remoteStream) {
                    setVideoStatus('resuming-play');
                    setFaceStatus('visible-resuming');
                    
                    // Force complete video reset before playing
                    video.load();
                    setTimeout(() => {
                        video.play()
                            .then(() => {
                                setVideoStatus('playing');
                                setFaceStatus('visible-playing');
                            })
                            .catch(() => {
                                setVideoStatus('resume-failed');
                                setFaceStatus('visible-failed');
                            });
                    }, 100);
                } else if (!video.paused) {
                    setFaceStatus('visible-already-playing');
                }
            };
            
            // Initial check
            ensureVideoPlaying();
            
            // Set up interval to keep checking while face is visible
            const playCheckInterval = setInterval(() => {
                if (isFaceVisible && video.paused) {
                    setFaceStatus('visible-auto-resume');
                    ensureVideoPlaying();
                }
            }, 1000);
            
            return () => clearInterval(playCheckInterval);
        } else if (!isLocal && !isFaceVisible) {
            setFaceStatus('hidden-active');
        }
    }, [isFaceVisible, isLocal, remoteStream]);

    // Lightweight pixel analysis for remote opponent safety validation
    const analyzeVideoSafety = useCallback(() => {
        if (isLocal || !videoRef.current || videoRef.current.readyState !== 4) {
            return 'checking';
        }

        try {
            const video = videoRef.current;
            const tempCanvas = document.createElement('canvas');
            const ctx = tempCanvas.getContext('2d');
            
            if (!ctx) return 'checking';

            // Sample a small region for analysis (lightweight)
            tempCanvas.width = 32;
            tempCanvas.height = 32;
            ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
            
            const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;
            
            // Check for face-like characteristics
            let skinTonePixels = 0;
            let brightPixels = 0;
            let totalPixels = data.length / 4;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Detect skin-tone-like colors (broad range)
                if (r > 120 && g > 80 && b > 60 && r > b && r > g * 0.8) {
                    skinTonePixels++;
                }
                
                // Check brightness (faces usually have varied lighting)
                const brightness = (r + g + b) / 3;
                if (brightness > 80 && brightness < 200) {
                    brightPixels++;
                }
            }
            
            const skinPercentage = (skinTonePixels / totalPixels) * 100;
            const brightPercentage = (brightPixels / totalPixels) * 100;
            
            // Simple heuristic: if it has reasonable skin tones and lighting variation, likely safe
            if (skinPercentage > 15 && brightPercentage > 30) {
                return 'safe';
            } else if (skinPercentage < 5) {
                // Very little skin tone detected - might be showing something else
                return 'unsafe';
            }
            
            return 'checking';
        } catch (error) {
            console.warn('Pixel analysis error:', error);
            return 'checking';
        }
    }, [isLocal, videoRef]);

    // Simplified safety analysis (keep lightweight monitoring)
    useEffect(() => {
        if (isLocal) return;

        const runSafetyAnalysis = () => {
            const status = analyzeVideoSafety();
            setSafetyStatus(status);
        };
        
        runSafetyAnalysis();
        const analysisInterval = setInterval(runSafetyAnalysis, 500); // Less frequent for performance
        
        return () => {
            clearInterval(analysisInterval);
        };
    }, [isLocal, analyzeVideoSafety]);

    // Debug logging for rendering decisions - only log when things change
    const debugKey = `${isLocal}-${isFaceVisible}-${!!remoteStream}-${faceCenter?.x?.toFixed(1)}-${faceCenter?.y?.toFixed(1)}`;
    if ((window as any).lastDebugKey !== debugKey) {
        console.log('🎬 FLICKER DEBUG - Component re-render triggered:', {
            isLocal,
            isFaceVisible,
            hasRemoteStream: !!remoteStream,
            faceCenter: faceCenter ? `${faceCenter.x.toFixed(2)},${faceCenter.y.toFixed(2)}` : 'null',
            username,
            renderCount: ((window as any).renderCount = ((window as any).renderCount || 0) + 1),
            timestamp: Date.now()
        });
        (window as any).lastDebugKey = debugKey;
    }

    // Simplified rendering - local uses canvas, remote uses raw video
    if (isLocal && canvasRef) {
        // Local player with canvas (for face mesh processing)
        return (
            <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9]">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={true}
                    className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1] hidden"
                ></video>
                
                <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1]"
                ></canvas>
                
                {/* LOCAL debug badge for canvas rendering */}
                <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs px-2 py-1 rounded z-50 max-w-xs text-xs leading-tight">
                    LOCAL | Face: {isFaceVisible ? 'YES' : 'NO'} | L: {landmarkCount} | Age: {Math.min(Math.floor((Date.now() - lastUpdate) / 1000), 999)}s
                    <div>Sending: {((window as any).lastSentTime && Date.now() - (window as any).lastSentTime < 2000) ? '✅' : '❌'}</div>
                </div>
                
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                    {username}
                </div>
            </div>
        );
    }

    // Remote player with simple face visibility control
    console.log('🔍 MultiplayerVideoFeed rendering:', {
        isLocal,
        isFaceVisible,
        username,
        shouldShowVideo: !isLocal && isFaceVisible
    });
    
    return (
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9]">
            {/* DEBUG: Always show something for testing */}
            <div className={`absolute ${isLocal ? 'bottom-2 left-2 bg-blue-500' : 'top-2 right-2 bg-yellow-500'} text-white text-xs px-2 py-1 rounded z-50 max-w-xs text-xs leading-tight`}>
                {isLocal ? 'LOCAL' : 'REMOTE'} | Face: {isFaceVisible ? 'YES' : 'NO'} | L: {landmarkCount} | Age: {Math.min(Math.floor((Date.now() - lastUpdate) / 1000), 999)}s
                {isLocal && (
                    <div>Sending: {((window as any).lastSentTime && Date.now() - (window as any).lastSentTime < 2000) ? '✅' : '❌'}</div>
                )}
            </div>
            
            {/* FORCE REMOTE VIDEO - MEMOIZED TO PREVENT FLICKERING */}
            {!isLocal && useMemo(() => {
                // Browser detection for positioning
                const isChrome = /Chrome/.test(navigator.userAgent) && !/Chromium/.test(navigator.userAgent);
                const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
                
                // Browser-specific fallback positioning
                let fallbackTransform;
                if (isChrome) {
                    // Chrome seems to need different positioning
                    fallbackTransform = 'scale(4.5) translateY(-20%)';
                } else if (isSafari) {
                    // Safari uses standard positioning
                    fallbackTransform = 'scale(4.5) translateY(-25%)';
                } else {
                    // Other browsers (Chromium, etc.)
                    fallbackTransform = 'scale(4.5) translateY(-22%)';
                }
                
                return (
                    <div 
                        className="absolute top-0 left-0 w-full h-full"
                        style={{ 
                            backgroundColor: 'transparent', // Debug background disabled
                            border: 'none' // Debug container border disabled
                        }}
                    >
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted={false}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                transform: faceCenter ? 
                                    `scale(4.5) translate(${(0.5 - faceCenter.x) * 80}%, ${(0.5 - faceCenter.y) * 80}%)` :
                                    fallbackTransform,
                                transformOrigin: 'center center',
                                objectFit: 'cover',
                                border: 'none',
                                zIndex: 1,
                                transition: 'transform 0.1s ease-out' // Much faster response
                            }}
                        ></video>
                        
                        <div 
                            style={{
                                position: 'absolute',
                                top: '10px',
                                left: '10px',
                                background: 'lime',
                                color: 'black',
                                padding: '5px',
                                fontSize: '12px',
                                zIndex: 2
                            }}
                        >
                            TRACKING: {faceCenter ? `X:${faceCenter.x.toFixed(2)} Y:${faceCenter.y.toFixed(2)}` : 'NO_DATA'} | ZOOM: 4.5x | {isFaceVisible ? 'FACE_YES' : 'FACE_NO'} | {isChrome ? 'CHROME' : isSafari ? 'SAFARI' : 'OTHER'}
                        </div>
                    </div>
                );
            }, [!!remoteStream, remoteStream?.id, faceCenter?.x, faceCenter?.y, isFaceVisible])}
            
            {/* Local player rendering */}
            {isLocal && (
                isFaceVisible ? (
                    /* Local player with face detected - show video */
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted={true}
                        className="absolute top-0 left-0 w-full h-full object-cover remote-video"
                    ></video>
                ) : (
                    /* Local player - no face detected */
                    <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-white border-2 border-red-500">
                        <div className="text-center p-4 bg-gray-800 rounded-lg">
                            <div className="text-4xl mb-3">👤</div>
                            <div className="text-lg font-semibold text-red-400">Face Not Detected</div>
                            <div className="text-sm text-gray-300 mt-2">Move back into camera view</div>
                        </div>
                    </div>
                )
            )}
            
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                {username}
                {!isLocal && (
                    <div className={`text-xs ml-2 ${
                        isFaceVisible ? 'text-green-400' : 'text-red-400'
                    }`}>
                        👁️ {isFaceVisible ? 'Face Detected' : 'No Face'}
                    </div>
                )}
                {!isLocal && (
                    <div className={`text-xs ml-2 ${
                        safetyStatus === 'safe' ? 'text-green-400' : 
                        safetyStatus === 'unsafe' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                        🛡️ {safetyStatus === 'safe' ? 'Safe' : safetyStatus === 'unsafe' ? 'Unsafe' : 'Checking'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MultiplayerVideoFeed;