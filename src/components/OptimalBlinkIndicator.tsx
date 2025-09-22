import React from 'react';

interface OptimalBlinkIndicatorProps {
  isBlinking: boolean;
  eyeOpenness: number;
  confidence?: number;
  username: string;
  latency?: number;
  className?: string;
}

const OptimalBlinkIndicator: React.FC<OptimalBlinkIndicatorProps> = ({
  isBlinking,
  eyeOpenness,
  confidence = 1.0,
  username,
  latency,
  className = ''
}) => {
  const getBlinkStatus = () => {
    if (isBlinking) {
      return {
        emoji: '😑',
        text: 'BLINKED!',
        color: 'text-red-500',
        bg: 'bg-red-100 border-red-300'
      };
    } else {
      return {
        emoji: '👁️',
        text: 'Staring...',
        color: 'text-green-500',
        bg: 'bg-green-100 border-green-300'
      };
    }
  };

  const status = getBlinkStatus();
  
  return (
    <div className={`p-3 rounded-lg border-2 ${status.bg} ${className}`}>
      <div className="text-center">
        <div className="text-3xl mb-2">{status.emoji}</div>
        <div className={`font-bold text-lg ${status.color}`}>
          {status.text}
        </div>
        <div className="text-sm text-gray-600 mt-1">
          {username}
        </div>
      </div>
      
      <div className="mt-3 space-y-1">
        {/* Eye openness bar */}
        <div className="flex items-center text-xs">
          <span className="w-16 text-gray-500">Eyes:</span>
          <div className="flex-1 bg-gray-200 rounded-full h-2 mx-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-100"
              style={{ width: `${eyeOpenness * 100}%` }}
            />
          </div>
          <span className="w-8 text-gray-600">
            {Math.round(eyeOpenness * 100)}%
          </span>
        </div>
        
        {/* Confidence indicator */}
        <div className="flex items-center text-xs">
          <span className="w-16 text-gray-500">Conf:</span>
          <div className="flex-1 bg-gray-200 rounded-full h-2 mx-2">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all duration-100"
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
          <span className="w-8 text-gray-600">
            {Math.round(confidence * 100)}%
          </span>
        </div>
        
        {/* Latency (if available) */}
        {latency !== undefined && (
          <div className="flex items-center text-xs">
            <span className="w-16 text-gray-500">Ping:</span>
            <span className={`text-xs ${latency < 50 ? 'text-green-600' : latency < 100 ? 'text-yellow-600' : 'text-red-600'}`}>
              {latency.toFixed(1)}ms
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default OptimalBlinkIndicator;