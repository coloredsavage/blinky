import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

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
  distractions: DistractionContent[];
  onComplete: (id: string) => void;
}

const DistractionOverlay: React.FC<DistractionOverlayProps> = ({
  isActive,
  distractions,
  onComplete
}) => {
  const [distractionStates, setDistractionStates] = useState<Record<string, 'enter' | 'active' | 'exit'>>({});
  const distractionPositions = useRef<Record<string, any>>({});
  const [closableAfter, setClosableAfter] = useState<Record<string, boolean>>({});
  const [dragStates, setDragStates] = useState<Record<string, {isDragging: boolean, offset: {x: number, y: number}}>>({});
  
  // Handle close button click
  const handleCloseClick = useCallback((distractionId: string) => {
    if (closableAfter[distractionId]) {
      onComplete(distractionId);
    }
  }, [closableAfter, onComplete]);

  const handleMouseDown = useCallback((e: React.MouseEvent, distractionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get the popup element itself, not just any parent
    const popup = e.currentTarget.closest('.retro-popup') as HTMLElement;
    if (!popup) return;

    // Add dragging class to disable transitions
    popup.classList.add('dragging');

    // Get the popup's current computed position (not bounding rect)
    const computedStyle = window.getComputedStyle(popup);
    const currentLeft = parseInt(computedStyle.left) || 0;
    const currentTop = parseInt(computedStyle.top) || 0;
    
    // Calculate offset from mouse to the popup's current position
    const offset = {
      x: e.clientX - currentLeft,
      y: e.clientY - currentTop
    };


    setDragStates(prev => ({
      ...prev,
      [distractionId]: { isDragging: true, offset }
    }));
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    Object.entries(dragStates).forEach(([distractionId, dragState]) => {
      if (dragState.isDragging) {
        // Calculate new position by subtracting the stored offset
        const newLeft = e.clientX - dragState.offset.x;
        const newTop = e.clientY - dragState.offset.y;
        
        const newPosition = {
          left: `${newLeft}px`,
          top: `${newTop}px`,
          right: 'auto',
          bottom: 'auto'
        };
        
        // Update the position for React state
        distractionPositions.current[distractionId] = newPosition;
        
        // Direct DOM manipulation for smooth dragging (like native OS windows)
        const popupElement = document.querySelector(`[data-distraction-id="${distractionId}"]`) as HTMLElement;
        if (popupElement) {
          popupElement.style.left = `${newLeft}px`;
          popupElement.style.top = `${newTop}px`;
          popupElement.style.right = 'auto';
          popupElement.style.bottom = 'auto';
        }
      }
    });
  }, [dragStates]);

  const handleMouseUp = useCallback(() => {
    // Remove dragging class from all popups to re-enable transitions
    document.querySelectorAll('.retro-popup.dragging').forEach(popup => {
      popup.classList.remove('dragging');
    });

    setDragStates(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(id => {
        newState[id] = { ...newState[id], isDragging: false };
      });
      return newState;
    });
  }, []);

  // Add global mouse events for dragging
  useEffect(() => {
    if (Object.values(dragStates).some(d => d.isDragging)) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragStates, handleMouseMove, handleMouseUp]);
  
  const shouldShow = isActive && distractions.length > 0;

  // Initialize states for new distractions - memoized to prevent infinite loops
  useEffect(() => {
    const newDistractions = distractions.filter(d => !distractionStates[d.id]);
    
    if (newDistractions.length === 0) return;
    
    console.log('🆕 Initializing new distractions:', newDistractions.map(d => d.id));
    
    newDistractions.forEach(distraction => {
      // Set initial state
      setDistractionStates(prev => ({
        ...prev,
        [distraction.id]: 'enter'
      }));

      // Enter animation
      setTimeout(() => {
        setDistractionStates(prev => ({
          ...prev,
          [distraction.id]: 'active'
        }));
      }, 300);

      // Make closable after 5 seconds
      setTimeout(() => {
        setClosableAfter(prev => ({
          ...prev,
          [distraction.id]: true
        }));
      }, 5000);

      // For ads (sponsor images), don't auto-remove - they stick until manually closed
      // Only auto-remove GIFs and other temporary distractions
      if (distraction.type !== 'image' && distraction.type !== 'sponsor') {
        setTimeout(() => {
          setDistractionStates(prev => ({
            ...prev,
            [distraction.id]: 'exit'
          }));
          
          // Exit animation
          setTimeout(() => {
            setDistractionStates(prev => {
              const newStates = { ...prev };
              delete newStates[distraction.id];
              return newStates;
            });
            // Clean up position and states
            delete distractionPositions.current[distraction.id];
            setClosableAfter(prev => {
              const newState = { ...prev };
              delete newState[distraction.id];
              return newState;
            });
            setDragStates(prev => {
              const newState = { ...prev };
              delete newState[distraction.id];
              return newState;
            });
            onComplete(distraction.id);
          }, 300);
        }, distraction.duration);
      }
    });
  }, [distractions.length]); // Only depend on length to prevent constant re-runs


  if (!shouldShow) {
    return null;
  }

  // Render test distractions differently
  const testDistractions = distractions.filter(d => d.id.includes('test') || d.id.includes('manual'));
  if (testDistractions.length > 0) {
    return (
      <div className="distraction-overlay">
        {testDistractions.map(distraction => (
          <div key={distraction.id} style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'red',
            color: 'white',
            padding: '20px',
            border: '5px solid yellow',
            fontSize: '18px',
            fontWeight: 'bold',
            zIndex: 99999
          }}>
            🚨 MANUAL TEST DISTRACTION! 🚨<br />
            ID: {distraction.id}<br />
            Type: {distraction.type}
          </div>
        ))}
      </div>
    );
  }

  const getRandomPosition = () => {
    // Avoid the center area where the video canvas is (roughly 40% width, 60% height in center)
    const positions = [
      { top: '5%', left: '5%' },      // Top left corner
      { top: '5%', right: '5%' },     // Top right corner  
      { top: '15%', left: '2%' },     // Left edge (higher up)
      { top: '15%', right: '2%' },    // Right edge (higher up)
      { bottom: '5%', left: '5%' },   // Bottom left corner
      { bottom: '5%', right: '5%' },  // Bottom right corner
      { top: '2%', left: '5%' },      // Top left area
      { top: '2%', right: '5%' },     // Top right area
      { bottom: '2%', left: '5%' },   // Bottom left area
      { bottom: '2%', right: '5%' },  // Bottom right area
      // Add more edge positions to avoid center
      { top: '50%', left: '2%' },     // Mid left edge
      { top: '50%', right: '2%' },    // Mid right edge
    ];
    return positions[Math.floor(Math.random() * positions.length)];
  };


  const renderGifPopup = (distraction: DistractionContent) => {
    // Get or create a stable position for this distraction
    if (!distractionPositions.current[distraction.id]) {
      distractionPositions.current[distraction.id] = getRandomPosition();
    }
    const position = distractionPositions.current[distraction.id];
    const animationPhase = distractionStates[distraction.id] || 'enter';
    const canClose = closableAfter[distraction.id];
    
    return (
      <div 
        key={distraction.id}
        data-distraction-id={distraction.id}
        className={`retro-popup ${animationPhase}`}
        style={{
          ...position,
          cursor: dragStates[distraction.id]?.isDragging ? 'grabbing' : 'grab'
        }}
      >
        <div 
          className="popup-header"
          onMouseDown={(e) => handleMouseDown(e, distraction.id)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="popup-title-bar">
            <span className="popup-title">GIF</span>
            <div className="popup-buttons">
              <div 
                className={`popup-button close ${canClose ? 'enabled' : 'disabled'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseClick(distraction.id);
                }}
                title={canClose ? 'Close' : 'Available in 5 seconds'}
              >
                ×
              </div>
            </div>
          </div>
        </div>
        <div className="popup-content">
          {distraction.imageUrl && (
            <img 
              src={distraction.imageUrl} 
              alt="Animated GIF" 
              className="gif-image"
              onError={(e) => {
                console.error('❌ Failed to load GIF:', distraction.imageUrl);
                const fallbackDiv = document.createElement('div');
                fallbackDiv.className = 'popup-image-fallback';
                fallbackDiv.style.cssText = 'background: linear-gradient(45deg, #ff6b6b, #4ecdc4); color: white; padding: 40px; text-align: center; font-size: 18px; font-weight: bold; border-radius: 8px;';
                fallbackDiv.innerHTML = '🎬 GIF UNAVAILABLE';
                e.currentTarget.parentNode?.replaceChild(fallbackDiv, e.currentTarget);
              }}
            />
          )}
          <div className="popup-footer">
            {distraction.sponsorName && (
              <div className="sponsor-credit">
                {distraction.sponsorName}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAdPopup = (distraction: DistractionContent) => {
    // Get or create a stable position for this distraction
    if (!distractionPositions.current[distraction.id]) {
      distractionPositions.current[distraction.id] = getRandomPosition();
    }
    const position = distractionPositions.current[distraction.id];
    const animationPhase = distractionStates[distraction.id] || 'enter';
    const canClose = closableAfter[distraction.id];
    
    return (
      <div 
        key={distraction.id}
        data-distraction-id={distraction.id}
        className={`retro-popup ${animationPhase}`}
        style={{
          ...position,
          cursor: dragStates[distraction.id]?.isDragging ? 'grabbing' : 'grab'
        }}
      >
        <div 
          className="popup-header"
          onMouseDown={(e) => handleMouseDown(e, distraction.id)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="popup-title-bar">
            <span className="popup-title">Advertisement</span>
            <div className="popup-buttons">
              <div 
                className={`popup-button close ${canClose ? 'enabled' : 'disabled'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseClick(distraction.id);
                }}
                title={canClose ? 'Close' : 'Available in 5 seconds'}
              >
                ×
              </div>
            </div>
          </div>
        </div>
        <div className="popup-content">
          {distraction.imageUrl ? (
            <img 
              src={distraction.imageUrl} 
              alt={`${distraction.sponsorName} Advertisement`} 
              className="ad-image"
              onError={(e) => {
                console.error('❌ Failed to load ad image:', distraction.imageUrl);
                const fallbackDiv = document.createElement('div');
                fallbackDiv.className = 'popup-image-fallback';
                fallbackDiv.style.cssText = 'background: linear-gradient(45deg, #ff6b6b, #4ecdc4); color: white; padding: 40px; text-align: center; font-size: 18px; font-weight: bold; border-radius: 8px;';
                fallbackDiv.innerHTML = '🎯 ADVERTISEMENT<br/>' + (distraction.content || 'Sponsor Content');
                e.currentTarget.parentNode?.replaceChild(fallbackDiv, e.currentTarget);
              }}
            />
          ) : (
            <div className="popup-image-fallback" style={{
              background: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
              color: 'white',
              padding: '40px',
              textAlign: 'center',
              fontSize: '18px',
              fontWeight: 'bold',
              borderRadius: '8px',
              marginBottom: '10px',
              minHeight: '120px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column'
            }}>
              🎯 ADVERTISEMENT<br/>
              {distraction.content || 'Sponsor Content'}<br/>
              <small style={{ fontSize: '12px', marginTop: '10px' }}>
                {distraction.sponsorName || 'Generic Sponsor'}
              </small>
            </div>
          )}
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
          <div className="click-indicator">👆</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="distraction-overlay">
      {/* Debug indicator */}
      <div style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        background: 'lime',
        color: 'black',
        padding: '5px 10px',
        fontSize: '12px',
        fontWeight: 'bold',
        zIndex: 99999,
        borderRadius: '5px',
        border: '2px solid black'
      }}>
        🟢 OVERLAY ACTIVE - COUNT: {distractions.length}
      </div>
      
      {/* Render all distractions */}
      {distractions.map(distraction => {
        // Check if it's a GIF from Tenor
        if (distraction.id?.startsWith('gif_')) {
          return renderGifPopup(distraction);
        }
        
        // Otherwise render as ad popup
        switch (distraction.type) {
          case 'image':
          case 'popup':
          case 'sponsor':
            return renderAdPopup(distraction);
          default:
            return (
              <div key={distraction.id} style={{
                position: 'fixed',
                top: '20%',
                right: '10%',
                background: 'orange',
                color: 'white',
                padding: '20px',
                border: '3px solid red',
                borderRadius: '10px',
                fontSize: '18px',
                fontWeight: 'bold',
                zIndex: 99999
              }}>
                🚨 FALLBACK DISTRACTION 🚨<br />
                Type: {distraction.type}<br />
                Content: {distraction.content || 'No content'}<br />
                ID: {distraction.id}
              </div>
            );
        }
      })}
      
      <style>{`
        .distraction-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: auto;
          z-index: 9999;
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
          user-select: none;
        }

        .retro-popup.dragging {
          transition: none !important; /* Disable transitions during drag for smooth performance */
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

        .popup-button.disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .popup-button.enabled {
          opacity: 1;
          cursor: pointer;
        }

        .popup-button.enabled:hover {
          background: #ff6b6b;
          color: white;
        }

        .popup-header {
          background: linear-gradient(to bottom, #0040ff, #0020aa);
          color: white;
          padding: 2px;
          cursor: grab;
          pointer-events: auto;
          position: relative;
          z-index: 10;
          user-select: none;
        }

        .popup-header:active {
          cursor: grabbing;
        }

        .popup-title-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2px 4px;
          font-weight: bold;
          pointer-events: auto;
          position: relative;
          z-index: 11;
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

        .gif-image {
          width: 100%;
          height: auto;
          max-height: 180px;
          object-fit: cover;
          border: 1px inset #c0c0c0;
          margin-bottom: 6px;
        }

        .ad-image {
          width: 100%;
          height: auto;
          max-height: 180px;
          object-fit: cover;
          border: 1px inset #c0c0c0;
          margin-bottom: 6px;
        }

        /* Legacy class for backwards compatibility */
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