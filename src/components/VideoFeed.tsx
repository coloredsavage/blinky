
import React, { RefObject, useEffect, useCallback, useState } from 'react';

interface VideoFeedProps {
    videoRef: RefObject<HTMLVideoElement>;
    canvasRef?: RefObject<HTMLCanvasElement>;
    overlayCanvasRef?: RefObject<HTMLCanvasElement>;
    username: string;
    isMuted: boolean;
    remoteStream?: MediaStream | null;
    opponentFaceBox?: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    } | null;
    isRemote?: boolean; // New prop to indicate if this is remote video
}

const VideoFeed: React.FC<VideoFeedProps> = ({ videoRef, canvasRef, overlayCanvasRef, username, isMuted, remoteStream, opponentFaceBox, isRemote = false }) => {
    const [safetyStatus, setSafetyStatus] = useState<'safe' | 'unsafe' | 'checking'>('checking');
    
    useEffect(() => {
        if (remoteStream && videoRef.current) {
            videoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, videoRef]);

    // Lightweight pixel analysis for safety validation
    const analyzeVideoSafety = useCallback(() => {
        if (!isRemote || !videoRef.current || videoRef.current.readyState !== 4) {
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
    }, [isRemote, videoRef]);

    // Canvas-based rendering for remote video (same as single player)
    const renderOpponentCanvas = useCallback(() => {
        if (!isRemote || !canvasRef?.current || !videoRef.current || !opponentFaceBox) {
            // If no face detected, keep canvas black (safety feature)
            if (isRemote && canvasRef?.current) {
                const canvasCtx = canvasRef.current.getContext('2d');
                if (canvasCtx) {
                    canvasCtx.fillStyle = '#000000';
                    canvasCtx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            }
            return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        
        if (!canvasCtx || video.readyState !== 4 || video.videoWidth === 0) return;

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        canvasCtx.save();
        
        // Clear with black background (safety feature)
        canvasCtx.fillStyle = '#000000';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        // Check safety status before rendering
        if (safetyStatus === 'unsafe') {
            // Keep canvas black if content is deemed unsafe
            console.log('🚫 Opponent video deemed unsafe - keeping black screen');
            canvasCtx.restore();
            return;
        }
        
        // Apply the same cropping logic as single player useFaceMesh
        const w = canvas.width;
        const h = canvas.height;
        const padX = 0.08;
        const padY = 0.12;
        
        // Calculate crop region
        let x = Math.max(0, (opponentFaceBox.minX - padX) * w);
        let y = Math.max(0, (opponentFaceBox.minY - padY) * h);
        let width = Math.min(w, (opponentFaceBox.maxX - opponentFaceBox.minX + 2 * padX) * w);
        let height = Math.min(h, (opponentFaceBox.maxY - opponentFaceBox.minY + 2 * padY) * h);

        // Draw only the eye region on black background (same as single player)
        canvasCtx.drawImage(video, x, y, width, height, 0, 0, w, h);
        
        // Debug safety status
        if (safetyStatus === 'checking') {
            canvasCtx.fillStyle = 'rgba(255, 255, 0, 0.1)';
            canvasCtx.fillRect(w - 20, 10, 10, 10);
        } else if (safetyStatus === 'safe') {
            canvasCtx.fillStyle = 'rgba(0, 255, 0, 0.1)';
            canvasCtx.fillRect(w - 20, 10, 10, 10);
        }
        
        canvasCtx.restore();
    }, [isRemote, canvasRef, videoRef, opponentFaceBox]);

    // Continuously render opponent canvas and analyze safety
    useEffect(() => {
        if (!isRemote || !canvasRef?.current) return;

        let animationFrame: number;
        let analysisInterval: number;
        
        const animate = () => {
            renderOpponentCanvas();
            animationFrame = requestAnimationFrame(animate);
        };
        
        // Run safety analysis every 200ms (5fps) for lightweight monitoring
        const runSafetyAnalysis = () => {
            const status = analyzeVideoSafety();
            setSafetyStatus(status);
        };
        
        animate();
        runSafetyAnalysis();
        analysisInterval = setInterval(runSafetyAnalysis, 200);
        
        return () => {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
            if (analysisInterval) {
                clearInterval(analysisInterval);
            }
        };
    }, [isRemote, renderOpponentCanvas, analyzeVideoSafety]);

    // Canvas-based rendering (for local player with face mesh, or remote with safety features)
    if (canvasRef) {
        return (
            <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9]">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isMuted}
                    className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1] hidden"
                ></video>
                <canvas
                    ref={canvasRef}
                    className={`absolute top-0 left-0 w-full h-full object-cover transform ${isRemote ? 'scale-x-1' : 'scale-x-[-1]'}`}
                ></canvas>
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                    {username}
                    {isRemote && opponentFaceBox && (
                        <div className="text-xs text-green-400 ml-2">👁️ Face Tracked</div>
                    )}
                    {isRemote && (
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
    }

    // Standard video rendering (remote video or when no canvas provided)
    return (
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9]">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isMuted}
                className={`absolute top-0 left-0 w-full h-full object-cover ${isRemote ? 'remote-video' : 'transform scale-x-[-1]'}`}
            ></video>
            {overlayCanvasRef && (
                <canvas
                    ref={overlayCanvasRef}
                    className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1]"
                ></canvas>
            )}
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
                {username}
            </div>
        </div>
    );
};

export default VideoFeed;
