import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

interface GazeTrackingResult {
  isLookingAway: boolean;
  gazeDirection: 'center' | 'left' | 'right' | 'up' | 'down' | 'unknown';
  lookingAwayStart: number | null;
}

const useGazeTracking = (
  videoRef: RefObject<HTMLVideoElement>,
  canvasRef: RefObject<HTMLCanvasElement>,
  onLookingAway?: (duration: number) => void,
  onLookingBack?: () => void
) => {
  const [isLookingAway, setIsLookingAway] = useState(false);
  const [gazeDirection, setGazeDirection] = useState<'center' | 'left' | 'right' | 'up' | 'down' | 'unknown'>('center');
  const [lookingAwayStart, setLookingAwayStart] = useState<number | null>(null);
  
  const gazeCheckRef = useRef<NodeJS.Timeout | null>(null);
  const lastGazeDirectionRef = useRef<string>('center');

  // Calculate gaze direction based on eye landmarks
  const calculateGazeDirection = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length < 468) return 'unknown';

    try {
      // Use nose tip and eye corners for gaze estimation
      const noseTip = landmarks[1]; // Nose tip
      const leftEyeInner = landmarks[133]; // Left eye inner corner
      const rightEyeInner = landmarks[362]; // Right eye inner corner
      const leftEyeOuter = landmarks[33]; // Left eye outer corner
      const rightEyeOuter = landmarks[263]; // Right eye outer corner

      if (!noseTip || !leftEyeInner || !rightEyeInner || !leftEyeOuter || !rightEyeOuter) {
        return 'unknown';
      }

      // Calculate eye center positions
      const leftEyeCenterX = (leftEyeInner.x + leftEyeOuter.x) / 2;
      const rightEyeCenterX = (rightEyeInner.x + rightEyeOuter.x) / 2;
      
      // Calculate relative position to nose
      const leftEyeToNose = leftEyeCenterX - noseTip.x;
      const rightEyeToNose = rightEyeCenterX - noseTip.x;

      // Determine gaze direction based on relative eye positions
      if (Math.abs(leftEyeToNose) < 0.05 && Math.abs(rightEyeToNose) < 0.05) {
        return 'center';
      } else if (leftEyeToNose < -0.08 && rightEyeToNose < -0.08) {
        return 'left';
      } else if (leftEyeToNose > 0.08 && rightEyeToNose > 0.08) {
        return 'right';
      } else if (noseTip.y < 0.3) {
        return 'up';
      } else if (noseTip.y > 0.7) {
        return 'down';
      } else {
        return 'center';
      }
    } catch (error) {
      console.warn('Error calculating gaze direction:', error);
      return 'unknown';
    }
  }, []);

  // Check if gaze direction indicates looking away
  const isLookingAwayDirection = useCallback((direction: string): boolean => {
    return direction === 'left' || direction === 'right' || direction === 'up';
  }, []);

  // Start gaze tracking
  const startGazeTracking = useCallback(() => {
    if (gazeCheckRef.current) {
      clearInterval(gazeCheckRef.current);
    }

    gazeCheckRef.current = setInterval(() => {
      // This would be called from the face mesh results callback
      // For now, we'll simulate gaze detection
      // In a real implementation, this would be integrated with useFaceMesh
    }, 100);
  }, []);

  // Stop gaze tracking
  const stopGazeTracking = useCallback(() => {
    if (gazeCheckRef.current) {
      clearInterval(gazeCheckRef.current);
      gazeCheckRef.current = null;
    }
  }, []);

  // Update gaze state based on direction
  const updateGazeState = useCallback((direction: string) => {
    const currentTime = Date.now();
    const isAway = isLookingAwayDirection(direction);
    
    setGazeDirection(direction as any);

    if (isAway && !isLookingAway) {
      // Started looking away
      setIsLookingAway(true);
      setLookingAwayStart(currentTime);
      console.log('👀 Player started looking away:', direction);
    } else if (!isAway && isLookingAway) {
      // Returned to center
      setIsLookingAway(false);
      const duration = lookingAwayStart ? currentTime - lookingAwayStart : 0;
      setLookingAwayStart(null);
      
      if (duration > 2000) { // Only trigger callback if away for > 2 seconds
        onLookingAway?.(duration);
      } else {
        onLookingBack?.();
      }
      console.log('👀 Player returned to center after:', duration, 'ms');
    }

    lastGazeDirectionRef.current = direction;
  }, [isLookingAway, lookingAwayStart, isLookingAwayDirection, onLookingAway, onLookingBack]);

  // Simulate gaze detection for testing (remove in production)
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        updateGazeState('left');
      } else if (event.key === 'ArrowRight') {
        updateGazeState('right');
      } else if (event.key === 'ArrowUp') {
        updateGazeState('up');
      } else if (event.key === 'ArrowDown') {
        updateGazeState('down');
      } else if (event.key === ' ') {
        updateGazeState('center');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [updateGazeState]);

  useEffect(() => {
    return () => {
      stopGazeTracking();
    };
  }, [stopGazeTracking]);

  return {
    isLookingAway,
    gazeDirection,
    lookingAwayStart,
    startGazeTracking,
    stopGazeTracking,
    updateGazeState,
    calculateGazeDirection
  };
};

export default useGazeTracking;
