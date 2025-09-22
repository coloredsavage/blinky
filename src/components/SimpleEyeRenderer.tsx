import React, { useEffect, useRef } from 'react';

interface EyeData {
  leftEyeOpenness: number;  // 0-1 scale
  rightEyeOpenness: number; // 0-1 scale
  isBlinking: boolean;
  isFaceCentered: boolean;
  timestamp: number;
  playerId: string;
}

interface SimpleEyeRendererProps {
  eyeData: EyeData | null;
  username: string;
  className?: string;
}

const SimpleEyeRenderer: React.FC<SimpleEyeRendererProps> = ({ eyeData, username, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!eyeData) {
      // Show "waiting" state
      ctx.fillStyle = '#666666';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for opponent...', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Calculate latency
    const latency = Date.now() - eyeData.timestamp;
    const isRecentData = latency < 200; // Data is fresh if less than 200ms old

    // Draw background based on face presence
    ctx.fillStyle = eyeData.isFaceCentered ? '#001100' : '#110000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Eye positions
    const leftEyeX = canvas.width * 0.3;
    const rightEyeX = canvas.width * 0.7;
    const eyeY = canvas.height * 0.4;
    const maxEyeRadius = 30;

    // Draw left eye
    const leftEyeHeight = eyeData.leftEyeOpenness * maxEyeRadius;
    if (eyeData.isBlinking || eyeData.leftEyeOpenness < 0.2) {
      // Closed or nearly closed eye - draw line
      ctx.strokeStyle = isRecentData ? '#00FF00' : '#FF6600';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(leftEyeX - 25, eyeY);
      ctx.lineTo(leftEyeX + 25, eyeY);
      ctx.stroke();
    } else {
      // Open eye - draw ellipse
      ctx.strokeStyle = isRecentData ? '#00FF00' : '#FF6600';
      ctx.fillStyle = isRecentData ? '#004400' : '#442200';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(leftEyeX, eyeY, 25, leftEyeHeight, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // Draw pupil
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(leftEyeX, eyeY, Math.min(15, leftEyeHeight * 0.6), 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw right eye
    const rightEyeHeight = eyeData.rightEyeOpenness * maxEyeRadius;
    if (eyeData.isBlinking || eyeData.rightEyeOpenness < 0.2) {
      // Closed or nearly closed eye - draw line
      ctx.strokeStyle = isRecentData ? '#00FF00' : '#FF6600';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rightEyeX - 25, eyeY);
      ctx.lineTo(rightEyeX + 25, eyeY);
      ctx.stroke();
    } else {
      // Open eye - draw ellipse
      ctx.strokeStyle = isRecentData ? '#00FF00' : '#FF6600';
      ctx.fillStyle = isRecentData ? '#004400' : '#442200';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(rightEyeX, eyeY, 25, rightEyeHeight, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // Draw pupil
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(rightEyeX, eyeY, Math.min(15, rightEyeHeight * 0.6), 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw status info
    ctx.fillStyle = isRecentData ? '#00FF00' : '#FF6600';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${username}`, 10, 20);
    ctx.fillText(`Latency: ${latency}ms`, 10, 35);
    ctx.fillText(`Face: ${eyeData.isFaceCentered ? 'Centered' : 'Off-center'}`, 10, 50);
    
    // Blink indicator
    if (eyeData.isBlinking) {
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BLINK!', canvas.width / 2, canvas.height * 0.8);
    }

  }, [eyeData, username]);

  return (
    <div className={`bg-black rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg relative aspect-[16/9] ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full"
      />
      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
        {username} (Simple Graphics)
      </div>
    </div>
  );
};

export default SimpleEyeRenderer;