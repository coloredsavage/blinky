import { useState, useCallback, useEffect } from 'react';

interface AnonymousSession {
  id: string;
  username: string;
  gamesPlayed: number;
  totalTime: number;
  bestScore: number;
}

type EmailTrigger = 'score' | 'games' | 'time' | 'manual';

const useEmailCapture = (
  session: AnonymousSession | null, 
  currentScore: number, 
  _gameStatus: any
) => {
  const [shouldShowEmailModal, setShouldShowEmailModal] = useState(false);
  const [emailTrigger, setEmailTrigger] = useState<EmailTrigger | null>(null);
  const [hasSubmittedEmail, setHasSubmittedEmail] = useState(false);
  const [emailSubmissionCount, setEmailSubmissionCount] = useState(0);

  // Check if user has already submitted email
  useEffect(() => {
    const savedEmail = localStorage.getItem('blinky_user_email');
    const submissionCount = parseInt(localStorage.getItem('blinky_email_submissions') || '0');
    
    if (savedEmail) {
      setHasSubmittedEmail(true);
    }
    setEmailSubmissionCount(submissionCount);
  }, []);

  // Logic to determine when to show email modal
  useEffect(() => {
    if (!session || hasSubmittedEmail || shouldShowEmailModal) return;

    // Trigger after achieving a good score (30+ seconds)
    if (currentScore > 30000 && Math.random() < 0.3) {
      setEmailTrigger('score');
      setShouldShowEmailModal(true);
      return;
    }

    // Trigger after playing multiple games
    if (session.gamesPlayed >= 5 && session.gamesPlayed % 10 === 0) {
      setEmailTrigger('games');
      setShouldShowEmailModal(true);
      return;
    }

    // Trigger after total time played
    if (session.totalTime > 180000 && Math.random() < 0.4) { // 3 minutes
      setEmailTrigger('time');
      setShouldShowEmailModal(true);
      return;
    }
  }, [session, currentScore, hasSubmittedEmail, shouldShowEmailModal]);

  const submitEmail = useCallback(async (email: string) => {
    try {
      console.log('📧 Submitting email:', email);
      
      // Save email to localStorage
      localStorage.setItem('blinky_user_email', email);
      
      // Save submission data
      const submissionData = {
        email,
        timestamp: Date.now(),
        trigger: emailTrigger,
        sessionData: session,
        currentScore
      };
      
      localStorage.setItem('blinky_email_submission', JSON.stringify(submissionData));
      
      // Update submission count
      const newCount = emailSubmissionCount + 1;
      setEmailSubmissionCount(newCount);
      localStorage.setItem('blinky_email_submissions', newCount.toString());
      
      // In a real app, you'd send this to your backend
      // await fetch('/api/email-capture', { method: 'POST', body: JSON.stringify(submissionData) });
      
      setHasSubmittedEmail(true);
      setShouldShowEmailModal(false);
      
      console.log('✅ Email submitted successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to submit email:', error);
      return false;
    }
  }, [emailTrigger, session, currentScore, emailSubmissionCount]);

  const dismissEmailModal = useCallback(() => {
    setShouldShowEmailModal(false);
    setEmailTrigger(null);
    
    // Mark as dismissed to avoid showing again too soon
    localStorage.setItem('blinky_email_dismissed', Date.now().toString());
  }, []);

  const triggerEmailModal = useCallback((trigger: EmailTrigger) => {
    if (hasSubmittedEmail) return;
    
    setEmailTrigger(trigger);
    setShouldShowEmailModal(true);
  }, [hasSubmittedEmail]);

  return {
    shouldShowEmailModal,
    emailTrigger,
    hasSubmittedEmail,
    submitEmail,
    dismissEmailModal,
    triggerEmailModal
  };
};

export default useEmailCapture;