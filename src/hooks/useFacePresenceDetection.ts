import { useState, useEffect, useRef } from 'react';

export interface FacePresenceResult {
  hasFace: boolean;
  faceLostAt: number | null;
  faceLostDuration: number;
  isWarningActive: boolean;
  warningCountdown: number;
}

interface UseFacePresenceDetectionProps {
  faceMeshReady: boolean;
  onFaceLost?: () => void;
  onFaceRegained?: () => void;
  onAutoLoss?: () => void;
  warningDuration?: number; // Time before auto-loss (default: 3 seconds)
}

export const useFacePresenceDetection = ({
  faceMeshReady,
  onFaceLost,
  onFaceRegained,
  onAutoLoss,
  warningDuration = 3000
}: UseFacePresenceDetectionProps): FacePresenceResult => {
  const [hasFace, setHasFace] = useState<boolean>(true);
  const [faceLostAt, setFaceLostAt] = useState<number | null>(null);
  const [isWarningActive, setIsWarningActive] = useState<boolean>(false);
  const [warningCountdown, setWarningCountdown] = useState<number>(warningDuration / 1000);
  
  const faceDetectionInterval = useRef<NodeJS.Timeout | null>(null);
  const warningInterval = useRef<NodeJS.Timeout | null>(null);
  const lastFaceDetectionTime = useRef<number>(Date.now());

  // Check face presence periodically
  useEffect(() => {
    if (!faceMeshReady) return;

    const checkFacePresence = () => {
      const currentTime = Date.now();
      const timeSinceLastDetection = currentTime - lastFaceDetectionTime.current;
      
      // If no face detection for more than 500ms, consider face lost
      const faceCurrentlyPresent = timeSinceLastDetection < 500;
      
      if (faceCurrentlyPresent !== hasFace) {
        setHasFace(faceCurrentlyPresent);
        
        if (!faceCurrentlyPresent) {
          // Face just lost
          const lostTime = Date.now();
          setFaceLostAt(lostTime);
          setIsWarningActive(true);
          setWarningCountdown(warningDuration / 1000);
          onFaceLost?.();
          
          // Start warning countdown
          if (warningInterval.current) {
            clearInterval(warningInterval.current);
          }
          
          warningInterval.current = setInterval(() => {
            setWarningCountdown(prev => {
              const newCountdown = prev - 0.1;
              if (newCountdown <= 0) {
                // Auto-loss triggered
                if (warningInterval.current) {
                  clearInterval(warningInterval.current);
                  warningInterval.current = null;
                }
                setIsWarningActive(false);
                onAutoLoss?.();
                return 0;
              }
              return Math.max(0, newCountdown);
            });
          }, 100);
          
        } else {
          // Face regained
          setFaceLostAt(null);
          setIsWarningActive(false);
          setWarningCountdown(warningDuration / 1000);
          
          if (warningInterval.current) {
            clearInterval(warningInterval.current);
            warningInterval.current = null;
          }
          
          onFaceRegained?.();
        }
      }
    };

    faceDetectionInterval.current = setInterval(checkFacePresence, 100);

    return () => {
      if (faceDetectionInterval.current) {
        clearInterval(faceDetectionInterval.current);
      }
      if (warningInterval.current) {
        clearInterval(warningInterval.current);
      }
    };
  }, [faceMeshReady, hasFace, onFaceLost, onFaceRegained, onAutoLoss, warningDuration]);

  // Update last detection time when face mesh is ready
  useEffect(() => {
    if (faceMeshReady) {
      lastFaceDetectionTime.current = Date.now();
    }
  }, [faceMeshReady]);

  // Calculate face lost duration
  const faceLostDuration = faceLostAt ? Date.now() - faceLostAt : 0;

  return {
    hasFace,
    faceLostAt,
    faceLostDuration,
    isWarningActive,
    warningCountdown
  };
};

// Utility function to update face detection (call this when face mesh detects a face)
export const updateFaceDetection = () => {
  // This would be called from useFaceMesh when a face is detected
  // For now, we'll simulate this by updating the ref directly
  // In a real implementation, this would be integrated with useFaceMesh
};
