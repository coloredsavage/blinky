import React, { useState, useEffect } from 'react';

interface DistractionContent {
  id: string;
  type: 'popup' | 'flash' | 'particle' | 'interactive' | 'sponsor' | 'image';
  content?: string;
  imageUrl?: string;
  duration: number;
  intensity: number; // 1-10 scale
  sponsorName?: string;
}

interface DistractionOverlayProps {
  isActive: boolean;
  distraction: DistractionContent | null;
  onComplete: () => void;
}

const DistractionOverlay: React.FC<DistractionOverlayProps> = ({
  isActive,
  distraction,
  onComplete
}) => {
  const [animationPhase, setAnimationPhase] = useState<'enter' | 'active' | 'exit'>('enter');
  
  // Simplify: if we have a distraction and it's active, show it
  const shouldShow = isActive && distraction;

  useEffect(() => {
    if (shouldShow) {
      setAnimationPhase('enter');
      
      // Enter animation duration
      const enterTimer = setTimeout(() => {
        setAnimationPhase('active');
      }, 300);

      // Total duration timer
      const durationTimer = setTimeout(() => {
        setAnimationPhase('exit');
        
        // Exit animation duration
        setTimeout(() => {
          onComplete();
        }, 300);
      }, distraction!.duration);

      return () => {
        clearTimeout(enterTimer);
        clearTimeout(durationTimer);
      };
    }
  }, [shouldShow, distraction?.id, distraction?.duration, onComplete]);

  if (!shouldShow) {
    return null;
  }

  const getRandomPosition = () => {
    const positions = [
      { top: '5%', left: '5%' },      // Top left corner
      { top: '5%', right: '5%' },     // Top right corner  
      { top: '30%', left: '2%' },     // Middle left edge
      { top: '30%', right: '2%' },    // Middle right edge
      { bottom: '5%', left: '5%' },   // Bottom left corner
      { bottom: '5%', right: '5%' },  // Bottom right corner
      { top: '2%', left: '20%' },     // Top center-left
      { top: '2%', right: '20%' },    // Top center-right
      { bottom: '2%', left: '25%' },  // Bottom center-left
      { bottom: '2%', right: '25%' }, // Bottom center-right
    ];
    return positions[Math.floor(Math.random() * positions.length)];
  };

  const renderImageDistraction = () => {
    const position = getRandomPosition();
    
    return (
      <div 
        className={`retro-popup ${animationPhase}`}
        style={position}
      >
        <div className="popup-header">
          <div className="popup-title-bar">
            <span className="popup-title">Advertisement</span>
            <div className="popup-buttons">
              <div className="popup-button minimize">_</div>
              <div className="popup-button close">Ã—</div>
            </div>
          </div>
        </div>
        <div className="popup-content">
          <img 
            src={distraction.imageUrl} 
            alt={`${distraction.sponsorName} Advertisement`} 
            className="popup-image"
            onError={(e) => {
              console.error('Failed to load sponsor image:', distraction.imageUrl);
              e.currentTarget.style.display = 'none';
            }}
          />
          {distraction.content && (
            <div className="popup-text">{distraction.content}</div>
          )}
          <div className="popup-footer">
            <button className="popup-link-button">Click Here!</button>
            {distraction.sponsorName && (
              <div className="sponsor-credit">
                Sponsored by {distraction.sponsorName}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPopupDistraction = () => (
    <div className={`distraction-popup ${animationPhase}`}>
      <div className="distraction-content">
        {distraction.imageUrl && (
          <img 
            src={distraction.imageUrl} 
            alt="Advertisement" 
            className="distraction-image"
          />
        )}
        {distraction.content && (
          <div className="distraction-text">{distraction.content}</div>
        )}
        {distraction.sponsorName && (
          <div className="sponsor-attribution">
            Sponsored by {distraction.sponsorName}
          </div>
        )}
      </div>
    </div>
  );

  const renderFlashDistraction = () => (
    <div className={`distraction-flash ${animationPhase}`}>
      <div className="flash-overlay" style={{
        backgroundColor: `hsl(${Math.random() * 360}, 70%, 50%)`,
        opacity: distraction.intensity / 10
      }} />
    </div>
  );

  const renderParticleDistraction = () => {
    const particles = Array.from({ length: distraction.intensity * 5 }, (_, i) => (
      <div
        key={i}
        className="particle"
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 2}s`,
          animationDuration: `${2 + Math.random() * 3}s`
        }}
      />
    ));
    
    return (
      <div className={`distraction-particles ${animationPhase}`}>
        {particles}
      </div>
    );
  };

  const renderInteractiveDistraction = () => (
    <div className={`distraction-interactive ${animationPhase}`}>
      <div className="interactive-element">
        <div className="bouncing-button">
          Click me to continue!
          <div className="click-indicator">ðŸ‘†</div>
        </div>
      </div>
    </div>
  );

  const renderDistraction = () => {
    switch (distraction.type) {
      case 'image':
        return renderImageDistraction();
      case 'popup':
      case 'sponsor':
        return renderPopupDistraction();
      case 'flash':
        return renderFlashDistraction();
      case 'particle':
        return renderParticleDistraction();
      case 'interactive':
        return renderInteractiveDistraction();
      default:
        return null;
    }
  };

  return (
    <div className="distraction-overlay">
      {renderDistraction()}
      
      <style>{`
        .distraction-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 1000;
        }

        .distraction-popup {
          position: absolute;
          top: 20%;
          right: 10%;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(240, 240, 240, 0.95));
          border: 3px solid #ff6b6b;
          border-radius: 15px;
          padding: 20px;
          max-width: 300px;
          box-shadow: 0 10px 30px rgba(255, 107, 107, 0.4);
          transform: scale(0) rotate(-10deg);
          transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .distraction-popup.enter {
          transform: scale(0) rotate(-10deg);
        }

        .distraction-popup.active {
          transform: scale(1) rotate(0deg);
        }

        .distraction-popup.exit {
          transform: scale(0) rotate(10deg);
          opacity: 0;
        }

        .distraction-content {
          text-align: center;
          color: #333;
        }

        .distraction-image {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin-bottom: 10px;
        }

        .distraction-text {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 10px;
        }

        .sponsor-attribution {
          font-size: 12px;
          color: #666;
          font-style: italic;
        }

        .distraction-flash {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .flash-overlay {
          width: 100%;
          height: 100%;
          animation: flash-pulse 0.5s ease-in-out infinite alternate;
        }

        @keyframes flash-pulse {
          0% { opacity: 0; }
          100% { opacity: 0.7; }
        }

        .distraction-particles {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .particle {
          position: absolute;
          width: 8px;
          height: 8px;
          background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4);
          border-radius: 50%;
          animation: particle-float linear infinite;
        }

        @keyframes particle-float {
          0% {
            transform: translateY(100vh) scale(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
            transform: scale(1);
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-20px) scale(0);
            opacity: 0;
          }
        }

        .distraction-interactive {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .interactive-element {
          background: rgba(255, 255, 255, 0.9);
          border: 3px solid #ff6b6b;
          border-radius: 20px;
          padding: 30px;
          text-align: center;
          box-shadow: 0 15px 35px rgba(255, 107, 107, 0.3);
        }

        .bouncing-button {
          font-size: 20px;
          font-weight: bold;
          color: #ff6b6b;
          animation: bounce 0.8s ease-in-out infinite;
          cursor: pointer;
        }

        .click-indicator {
          font-size: 30px;
          animation: click-pulse 1s ease-in-out infinite;
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes click-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }

        /* Retro 90s popup styles */
        .retro-popup {
          position: fixed;
          width: 300px;
          background: #c0c0c0;
          border: 2px outset #c0c0c0;
          box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
          font-family: 'MS Sans Serif', sans-serif;
          font-size: 11px;
          z-index: 9999;
          transform: scale(0);
          transition: all 0.3s ease-out;
        }

        .retro-popup.enter {
          transform: scale(0);
        }

        .retro-popup.active {
          transform: scale(1);
          animation: popup-wobble 0.5s ease-out, popup-float 3s ease-in-out infinite 1s;
        }

        .retro-popup.exit {
          transform: scale(0);
          opacity: 0;
        }

        .popup-header {
          background: linear-gradient(to bottom, #0040ff, #0020aa);
          color: white;
          padding: 2px;
        }

        .popup-title-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2px 4px;
          font-weight: bold;
        }

        .popup-title {
          font-size: 11px;
        }

        .popup-buttons {
          display: flex;
          gap: 2px;
        }

        .popup-button {
          width: 16px;
          height: 14px;
          background: #c0c0c0;
          border: 1px outset #c0c0c0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          cursor: pointer;
          color: black;
        }

        .popup-button:hover {
          background: #e0e0e0;
        }

        .popup-button:active {
          border: 1px inset #c0c0c0;
        }

        .popup-content {
          padding: 8px;
          background: #c0c0c0;
        }

        .popup-image {
          width: 100%;
          height: auto;
          max-height: 180px;
          object-fit: cover;
          border: 1px inset #c0c0c0;
          margin-bottom: 6px;
        }

        .popup-text {
          font-size: 12px;
          color: #000080;
          font-weight: bold;
          text-align: center;
          margin-bottom: 8px;
          text-shadow: 1px 1px 0px rgba(255, 255, 255, 0.8);
        }

        .popup-footer {
          border-top: 1px solid #808080;
          padding-top: 6px;
          text-align: center;
        }

        .popup-link-button {
          background: linear-gradient(to bottom, #ff4040, #cc0000);
          color: white;
          border: 1px outset #ff4040;
          padding: 4px 12px;
          font-size: 11px;
          font-weight: bold;
          cursor: pointer;
          margin-bottom: 4px;
          text-shadow: 1px 1px 0px rgba(0, 0, 0, 0.5);
        }

        .popup-link-button:hover {
          background: linear-gradient(to bottom, #ff6060, #ee2020);
        }

        .popup-link-button:active {
          border: 1px inset #ff4040;
        }

        .sponsor-credit {
          font-size: 9px;
          color: #606060;
          font-style: italic;
        }

        @keyframes popup-wobble {
          0% { transform: scale(0) rotate(-5deg); }
          50% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }

        @keyframes popup-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
};

export default DistractionOverlay;