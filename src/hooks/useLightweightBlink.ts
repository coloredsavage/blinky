import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

interface BlinkData {
  isBlinking: boolean;
  eyeOpenness: number; // 0-1 scale
  faceDetected: boolean;
  timestamp: number;
}

// Lightweight blink detection using pixel analysis
const useLightweightBlink = (videoRef: RefObject<HTMLVideoElement>) => {
  const [blinkData, setBlinkData] = useState<BlinkData>({
    isBlinking: false,
    eyeOpenness: 0.8,
    faceDetected: false,
    timestamp: Date.now()
  });
  
  const [isReady, setIsReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const lastBlinkTime = useRef<number>(0);

  // Create analysis canvas
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; // Small for performance
    canvas.height = 120;
    canvasRef.current = canvas;
    setIsReady(true);
  }, []);

  // Simple eye region detection using pixel brightness
  const analyzeFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Set willReadFrequently for better performance
    if (!ctx.canvas.hasAttribute('willReadFrequently')) {
      ctx.canvas.setAttribute('willReadFrequently', 'true');
    }

    try {
      // Draw video frame to small canvas for analysis
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get image data for analysis
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Analyze eye regions (approximate positions)
      const eyeRegions = [
        { x: canvas.width * 0.25, y: canvas.height * 0.4, width: canvas.width * 0.15, height: canvas.height * 0.1 }, // Left eye
        { x: canvas.width * 0.6, y: canvas.height * 0.4, width: canvas.width * 0.15, height: canvas.height * 0.1 }   // Right eye
      ];
      
      let totalEyeBrightness = 0;
      let pixelCount = 0;
      let faceDetected = false;
      
      // Calculate average brightness in eye regions
      eyeRegions.forEach(region => {
        for (let y = Math.floor(region.y); y < Math.floor(region.y + region.height); y++) {
          for (let x = Math.floor(region.x); x < Math.floor(region.x + region.width); x++) {
            if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
              const index = (y * canvas.width + x) * 4;
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
      
      // Calculate overall image brightness to detect face presence
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel for performance
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      const avgBrightness = totalBrightness / (data.length / 16);
      
      // Basic face detection: reasonable brightness range
      faceDetected = avgBrightness > 30 && avgBrightness < 200;
      
      if (pixelCount > 0 && faceDetected) {
        const avgEyeBrightness = totalEyeBrightness / pixelCount;
        
        // Normalize eye openness (higher brightness = more open eyes)
        // Adjusted for better sensitivity
        const eyeOpenness = Math.max(0, Math.min(1, (avgEyeBrightness - 40) / 80));
        
        // Blink detection: more sensitive threshold
        const isBlinking = eyeOpenness < 0.4;
        
        // Debug logging for blink detection
        if (Math.random() < 0.01) { // Log 1% of frames to avoid spam
          console.log(`👁️ Eye Analysis: brightness=${avgEyeBrightness.toFixed(1)}, openness=${eyeOpenness.toFixed(2)}, blinking=${isBlinking}`);
        }
        
        // Prevent rapid blink toggling
        const now = Date.now();
        const timeSinceLastBlink = now - lastBlinkTime.current;
        
        if (isBlinking && timeSinceLastBlink > 150) { // Minimum 150ms between blinks
          lastBlinkTime.current = now;
        }
        
        setBlinkData({
          isBlinking: isBlinking && timeSinceLastBlink > 150,
          eyeOpenness,
          faceDetected,
          timestamp: now
        });
      } else {
        setBlinkData(prev => ({
          ...prev,
          faceDetected: false,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.warn('Lightweight blink analysis error:', error);
    }
  }, []); // Remove videoRef dependency to prevent infinite re-renders

  // Animation loop
  const startAnalysis = useCallback(() => {
    const analyze = () => {
      analyzeFrame();
      animationFrameRef.current = requestAnimationFrame(analyze);
    };
    analyze();
  }, [analyzeFrame]);

  const stopAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  // Auto-start when video is ready
  useEffect(() => {
    if (!videoRef.current || !isReady) return;

    const video = videoRef.current;
    
    const handleLoadedData = () => {
      console.log('🚀 Starting lightweight blink detection');
      startAnalysis();
    };

    if (video.readyState >= 2) {
      handleLoadedData();
    } else {
      video.addEventListener('loadeddata', handleLoadedData);
    }

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      stopAnalysis();
    };
  }, [videoRef, isReady, startAnalysis, stopAnalysis]);

  return {
    blinkData,
    isReady,
    startAnalysis,
    stopAnalysis
  };
};

export default useLightweightBlink;