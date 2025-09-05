import React, { useState, useEffect, useRef } from 'react';

type EmailTrigger = 'score' | 'games' | 'time' | 'manual';

interface EmailStats {
  bestScore: number;
  gamesPlayed: number;
  totalTime: number;
}

interface EmailCaptureModalProps {
  isOpen: boolean;
  onSubmit: (email: string) => Promise<boolean>;
  onDismiss: () => void;
  trigger: EmailTrigger;
  stats: EmailStats;
  currentUsername: string;
}

const EmailCaptureModal: React.FC<EmailCaptureModalProps> = ({
  isOpen,
  onSubmit,
  onDismiss,
  trigger,
  stats,
  currentUsername
}) => {
  const [email, setEmail] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setIsValid(emailRegex.test(email));
  }, [email]);

  const getTriggerMessage = () => {
    switch (trigger) {
      case 'score':
        return `Impressive! You lasted ${(stats.bestScore / 1000).toFixed(1)} seconds without blinking!`;
      case 'games':
        return `You've played ${stats.gamesPlayed} games! You're really getting the hang of this.`;
      case 'time':
        return `You've spent ${Math.floor(stats.totalTime / 60000)} minutes perfecting your stare!`;
      default:
        return "You're doing great! Want to stay updated on new features?";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      const success = await onSubmit(email);
      if (success) {
        setEmail('');
      }
    } catch (err) {
      setError('Failed to save email. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="email-modal-backdrop" onClick={onDismiss}>
      <div className="email-modal" onClick={(e) => e.stopPropagation()}>
        <div className="email-modal-header">
          <h3>🎯 Level Up Your Game!</h3>
          <button 
            className="email-modal-close" 
            onClick={onDismiss}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        <div className="email-modal-content">
          <div className="stats-highlight">
            <div className="stat-item">
              <span className="stat-label">Best Score:</span>
              <span className="stat-value">{(stats.bestScore / 1000).toFixed(1)}s</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Games Played:</span>
              <span className="stat-value">{stats.gamesPlayed}</span>
            </div>
          </div>

          <p className="trigger-message">{getTriggerMessage()}</p>
          <p className="incentive-text">
            Hey {currentUsername}! Want to get notified about new game modes, 
            leaderboards, and exclusive challenges? Join our community!
          </p>

          <form onSubmit={handleSubmit} className="email-form">
            <div className="email-input-container">
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className={`email-input ${isValid ? 'valid' : ''} ${error ? 'error' : ''}`}
                disabled={isSubmitting}
                required
              />
              <div className="input-indicator">
                {email && (isValid ? '✓' : '!')}
              </div>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="email-submit-btn"
            >
              {isSubmitting ? (
                <>
                  <span className="loading-spinner"></span>
                  Saving...
                </>
              ) : (
                'Get Updates 🚀'
              )}
            </button>
          </form>

          <div className="privacy-note">
            <small>
              We respect your privacy. No spam, unsubscribe anytime.
            </small>
          </div>
        </div>

        <style>{`
          .email-modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            animation: modalFadeIn 0.3s ease-out;
          }
          
          .email-modal {
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border-radius: 20px;
            padding: 0;
            max-width: 450px;
            width: 90%;
            max-height: 90vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(147, 51, 234, 0.3);
            border: 1px solid rgba(147, 51, 234, 0.2);
            animation: modalSlideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          }
          
          .email-modal-header {
            background: linear-gradient(135deg, rgb(147, 51, 234), rgb(168, 85, 247));
            padding: 20px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
          }
          
          .email-modal-header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%);
            animation: shimmer 3s infinite;
          }
          
          .email-modal-header h3 {
            margin: 0;
            color: white;
            font-size: 1.25rem;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            position: relative;
            z-index: 1;
          }
          
          .email-modal-close {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            color: white;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            position: relative;
            z-index: 1;
          }
          
          .email-modal-close:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
          }
          
          .email-modal-content {
            padding: 24px;
            color: white;
          }
          
          .stats-highlight {
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.2));
            border: 1px solid rgba(34, 197, 94, 0.3);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          
          .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          
          .stat-label {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 4px;
          }
          
          .stat-value {
            font-size: 1.2rem;
            font-weight: bold;
            color: rgb(34, 197, 94);
            text-shadow: 0 0 10px rgba(34, 197, 94, 0.3);
          }
          
          .trigger-message {
            text-align: center;
            margin-bottom: 16px;
            color: rgb(168, 85, 247);
            font-weight: bold;
            font-size: 1rem;
          }
          
          .incentive-text {
            text-align: center;
            margin-bottom: 24px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 0.95rem;
            line-height: 1.5;
          }
          
          .email-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          
          .email-input-container {
            position: relative;
          }
          
          .email-input {
            width: 100%;
            padding: 14px 50px 14px 16px;
            border: 2px solid rgba(147, 51, 234, 0.3);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.05);
            color: white;
            font-size: 1rem;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
            box-sizing: border-box;
          }
          
          .email-input:focus {
            outline: none;
            border-color: rgb(147, 51, 234);
            box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.2);
            background: rgba(255, 255, 255, 0.08);
          }
          
          .email-input.valid {
            border-color: rgb(34, 197, 94);
          }
          
          .email-input.error {
            border-color: rgb(239, 68, 68);
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
          }
          
          .email-input::placeholder {
            color: rgba(255, 255, 255, 0.5);
          }
          
          .input-indicator {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 18px;
            font-weight: bold;
          }
          
          .email-input.valid ~ .input-indicator {
            color: rgb(34, 197, 94);
          }
          
          .email-input:not(.valid) ~ .input-indicator {
            color: rgb(239, 68, 68);
          }
          
          .error-message {
            color: rgb(239, 68, 68);
            font-size: 0.875rem;
            margin-top: -8px;
            text-align: center;
          }
          
          .email-submit-btn {
            background: linear-gradient(135deg, rgb(147, 51, 234), rgb(168, 85, 247));
            color: white;
            border: none;
            border-radius: 12px;
            padding: 14px 24px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 15px rgba(147, 51, 234, 0.3);
          }
          
          .email-submit-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(147, 51, 234, 0.4);
          }
          
          .email-submit-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }
          
          .loading-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          
          .privacy-note {
            text-align: center;
            margin-top: 16px;
            color: rgba(255, 255, 255, 0.6);
          }
          
          @keyframes modalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes modalSlideIn {
            from { 
              opacity: 0; 
              transform: translateY(30px) scale(0.9); 
            }
            to { 
              opacity: 1; 
              transform: translateY(0) scale(1); 
            }
          }
          
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @media (max-width: 768px) {
            .email-modal {
              margin: 20px;
              max-width: none;
            }
            
            .email-modal-header {
              padding: 16px 20px;
            }
            
            .email-modal-content {
              padding: 20px;
            }
            
            .stats-highlight {
              grid-template-columns: 1fr;
              gap: 12px;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default EmailCaptureModal;