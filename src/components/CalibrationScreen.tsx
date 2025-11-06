import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameMode } from '../types';
import VideoFeed from './VideoFeed';
import useFaceMesh from '../hooks/useFaceMesh';

interface CalibrationScreenProps {
  username?: string;
  onComplete: (threshold: number) => void;
}

const CalibrationScreen: React.FC<CalibrationScreenProps> = ({ 
  username = 'Player', 
  onComplete
}) => {
  const [calibrationStatus, setCalibrationStatus] = useState<'idle' | 'counting' | 'calibrating' | 'complete'>('idle');
  const [countdown, setCountdown] = useState(5);
  const [progress, setProgress] = useState(0);
  const [earSamples, setEarSamples] = useState<number[]>([]);
  const [calculatedThreshold, setCalculatedThreshold] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const calibrationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sampleIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { 
    isReady: faceMeshReady, 
    leftEar, 
    rightEar, 
    isFaceCentered, 
    lightingQuality,
    startFaceMesh, 
  } = useFaceMesh(videoRef as React.RefObject<HTMLVideoElement>, canvasRef as React.RefObject<HTMLCanvasElement>);

  // Calculate EAR (Eye Aspect Ratio) from both eyes
  const currentEAR = React.useMemo(() => {
    if (leftEar === 0 || rightEar === 0) return 0;
    return (leftEar + rightEar) / 2;
  }, [leftEar, rightEar]);

  const startCountdown = useCallback(() => {
    setCalibrationStatus('counting');
    setCountdown(5);
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          startCalibration();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const startCalibration = useCallback(() => {
    setCalibrationStatus('calibrating');
    setProgress(0);
    setEarSamples([]);
    
    // Progress bar animation
    calibrationIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          if (calibrationIntervalRef.current) {
            clearInterval(calibrationIntervalRef.current);
            calibrationIntervalRef.current = null;
          }
          finishCalibration();
          return 100;
        }
        return prev + (100 / 30); // 3 seconds total
      });
    }, 100);

    // Collect EAR samples every 100ms
    sampleIntervalRef.current = setInterval(() => {
      if (currentEAR > 0) {
        setEarSamples(prev => [...prev, currentEAR]);
      }
    }, 100);
  }, [currentEAR]);

  const finishCalibration = useCallback(() => {
    if (sampleIntervalRef.current) {
      clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }

    // Calculate personalized threshold
    if (earSamples.length > 0) {
      // Calculate mean and standard deviation
      const mean = earSamples.reduce((sum, ear) => sum + ear, 0) / earSamples.length;
      const stdDev = Math.sqrt(
        earSamples.reduce((sum, ear) => sum + Math.pow(ear - mean, 2), 0) / earSamples.length
      );
      
      // Set threshold to mean - 2 standard deviations (captures ~95% of normal variation)
      const threshold = Math.max(0.1, mean - (2 * stdDev));
      setCalculatedThreshold(threshold);
      
      setCalibrationStatus('complete');
      
      // Auto-complete after showing result for 2 seconds
      setTimeout(() => {
        onComplete(threshold);
      }, 2000);
    } else {
      // Fallback to default threshold if no samples collected
      onComplete(0.25);
    }
  }, [earSamples, onComplete]);

  const handleCameraReady = useCallback(() => {
    startFaceMesh();
  }, [startFaceMesh]);

  const requestCamera = useCallback(() => {
    navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      } 
    })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        handleCameraReady();
      })
      .catch((error) => {
        console.error('Camera access error during calibration:', error);
        // Fallback to default threshold if camera fails
        onComplete(0.25);
      });
  }, [handleCameraReady, onComplete]);

  useEffect(() => {
    requestCamera();
  }, [requestCamera]);

  useEffect(() => {
    return () => {
      // Cleanup intervals
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (calibrationIntervalRef.current) clearInterval(calibrationIntervalRef.current);
      if (sampleIntervalRef.current) clearInterval(sampleIntervalRef.current);
    };
  }, []);

  const getStatusMessage = (): string => {
    if (!faceMeshReady) return "Loading face detection...";
    if (lightingQuality === 'poor') return "⚠️ Poor lighting detected!\nPlease improve lighting for better accuracy.";
    if (!isFaceCentered) return "Please center your face in the frame.";
    
    switch (calibrationStatus) {
      case 'idle':
        return "Ready to calibrate!\nClick Start to begin.";
      case 'counting':
        return `Get ready...\n${countdown}`;
      case 'calibrating':
        return "Keep your eyes open!\nCalibrating...";
      case 'complete':
        return "Calibration complete!";
      default:
        return "Ready to calibrate!";
    }
  };

  const getStatusColor = (): string => {
    switch (calibrationStatus) {
      case 'idle':
        return 'text-gray-400';
      case 'counting':
        return 'text-yellow-400';
      case 'calibrating':
        return 'text-blue-400';
      case 'complete':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-gray-900 bg-opacity-50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 text-center shadow-lg">
        <h1 className="text-3xl font-bold text-purple-400 mb-4">
          🎯 Calibration
        </h1>
        
        <p className="text-gray-300 mb-6">
          We'll measure your normal eye state to improve blink detection accuracy.
          Keep your eyes open and face centered during calibration.
        </p>

        {/* Video Feed */}
        <div className="manga-video-feed mb-6 mx-auto max-w-md">
          <div className="video-crop-wrapper">
            <VideoFeed 
              videoRef={videoRef as React.RefObject<HTMLVideoElement>} 
              canvasRef={canvasRef as React.RefObject<HTMLCanvasElement>} 
              username={username} 
              isMuted={true} 
            />
          </div>
        </div>

        {/* Status Display */}
        <div className="mb-6">
          <div className={`text-xl font-semibold mb-2 ${getStatusColor()} whitespace-pre-line`}>
            {getStatusMessage()}
          </div>
          
          {/* Progress Bar */}
          {(calibrationStatus === 'calibrating' || calibrationStatus === 'complete') && (
            <div className="w-full bg-gray-700 rounded-full h-4 mb-4">
              <div 
                className="bg-purple-500 h-4 rounded-full transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}

          {/* EAR Display */}
          {calibrationStatus === 'calibrating' && (
            <div className="text-sm text-gray-400">
              Current EAR: {currentEAR.toFixed(3)}
              <br />
              Samples collected: {earSamples.length}
            </div>
          )}

          {/* Results */}
          {calibrationStatus === 'complete' && calculatedThreshold && (
            <div className="text-green-400 text-lg font-semibold">
              Personalized threshold: {calculatedThreshold.toFixed(3)}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex justify-center">
          {calibrationStatus === 'idle' && (
            <button
              className="btn-primary text-lg px-6 py-3"
              onClick={startCountdown}
              disabled={!faceMeshReady || !isFaceCentered || lightingQuality === 'poor'}
            >
              Start Calibration
            </button>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 text-sm text-gray-500">
          <p>💡 Tips for best results:</p>
          <ul className="list-disc list-inside text-left max-w-md mx-auto">
            <li>Good lighting on your face</li>
            <li>Face centered in frame</li>
            <li>Keep eyes open naturally</li>
            <li>Stay still during calibration</li>
          </ul>
        </div>
      </div>

      <style>{`
        .btn-primary { 
          background-color: rgb(147 51 234);
          color: white;
          font-weight: bold;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          transition: all 0.3s ease;
          transform: scale(1);
          border: none;
          cursor: pointer;
        }
        .btn-primary:hover:not(:disabled) { 
          background-color: rgb(126 34 206);
          transform: scale(1.05);
        }
        .btn-primary:disabled {
          background-color: rgb(55 65 81);
          cursor: not-allowed;
          transform: scale(1);
        }
        .btn-secondary { 
          background-color: rgb(31 41 55);
          color: white;
          font-weight: bold;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          transition: all 0.3s ease;
          border: none;
          cursor: pointer;
        }
        .btn-secondary:hover { 
          background-color: rgb(55 65 81);
        }
        
        .manga-video-feed {
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 1rem;
          overflow: hidden;
          border: 3px solid rgba(147, 51, 234, 0.5);
          box-shadow: 0 8px 32px rgba(147, 51, 234, 0.2);
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.8), rgba(31, 31, 31, 0.6));
          position: relative;
        }
        
        .manga-video-feed video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 65% !important;
          transform: translateY(-20%);
        }
        
        .manga-video-feed canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
};

export default CalibrationScreen;
