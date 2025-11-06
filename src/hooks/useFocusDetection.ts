import { useState, useEffect, useCallback } from 'react';

interface FocusDetectionResult {
  isFocused: boolean;
  lostFocusAt: number | null;
  focusLostCount: number;
}

const useFocusDetection = (onFocusLost?: () => void, onFocusRegained?: () => void) => {
  const [isFocused, setIsFocused] = useState(true);
  const [lostFocusAt, setLostFocusAt] = useState<number | null>(null);
  const [focusLostCount, setFocusLostCount] = useState(0);

  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    
    if (!isVisible && isFocused) {
      // Tab/window lost focus
      console.log('🔍 Tab/window lost focus');
      setIsFocused(false);
      setLostFocusAt(Date.now());
      setFocusLostCount(prev => prev + 1);
      onFocusLost?.();
    } else if (isVisible && !isFocused) {
      // Tab/window regained focus
      console.log('🔍 Tab/window regained focus');
      setIsFocused(true);
      setLostFocusAt(null);
      onFocusRegained?.();
    }
  }, [isFocused, onFocusLost, onFocusRegained]);

  const handleBlur = useCallback(() => {
    // Window blur event (alt-tab, switching apps)
    console.log('🔍 Window blur detected');
    if (isFocused) {
      setIsFocused(false);
      setLostFocusAt(Date.now());
      setFocusLostCount(prev => prev + 1);
      onFocusLost?.();
    }
  }, [isFocused, onFocusLost]);

  const handleFocus = useCallback(() => {
    // Window focus event
    console.log('🔍 Window focus detected');
    if (!isFocused) {
      setIsFocused(true);
      setLostFocusAt(null);
      onFocusRegained?.();
    }
  }, [isFocused, onFocusRegained]);

  useEffect(() => {
    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      // Cleanup
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [handleVisibilityChange, handleBlur, handleFocus]);

  return {
    isFocused,
    lostFocusAt,
    focusLostCount
  };
};

export default useFocusDetection;
