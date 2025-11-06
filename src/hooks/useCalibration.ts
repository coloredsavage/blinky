import { useState, useEffect } from 'react';

interface CalibrationState {
  isCalibrated: boolean;
  personalizedThreshold: number | null;
  calibrationDate: string | null;
}

const DEFAULT_THRESHOLD = 0.25;
const CALIBRATION_STORAGE_KEY = 'blinky-calibration';

export const useCalibration = () => {
  const [calibrationState, setCalibrationState] = useState<CalibrationState>({
    isCalibrated: false,
    personalizedThreshold: null,
    calibrationDate: null,
  });

  // Load calibration state from localStorage on mount
  useEffect(() => {
    const savedCalibration = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (savedCalibration) {
      try {
        const parsed = JSON.parse(savedCalibration);
        setCalibrationState(parsed);
      } catch (error) {
        console.error('Failed to parse saved calibration:', error);
        // Reset to default if corrupted
        resetCalibration();
      }
    }
  }, []);

  const saveCalibration = (threshold: number) => {
    const newState: CalibrationState = {
      isCalibrated: true,
      personalizedThreshold: threshold,
      calibrationDate: new Date().toISOString(),
    };
    
    setCalibrationState(newState);
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(newState));
    
    console.log('✅ Calibration saved:', {
      threshold,
      date: newState.calibrationDate,
    });
  };

  const resetCalibration = () => {
    const defaultState: CalibrationState = {
      isCalibrated: false,
      personalizedThreshold: null,
      calibrationDate: null,
    };
    
    setCalibrationState(defaultState);
    localStorage.removeItem(CALIBRATION_STORAGE_KEY);
    
    console.log('🔄 Calibration reset to default');
  };

  const getCurrentThreshold = (): number => {
    return calibrationState.personalizedThreshold || DEFAULT_THRESHOLD;
  };

  const shouldShowCalibration = (): boolean => {
    // Show calibration if user hasn't calibrated before
    // or if calibration is more than 30 days old
    if (!calibrationState.isCalibrated || !calibrationState.calibrationDate) {
      return true;
    }

    const calibrationDate = new Date(calibrationState.calibrationDate);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return calibrationDate < thirtyDaysAgo;
  };

  const getCalibrationInfo = () => {
    return {
      ...calibrationState,
      currentThreshold: getCurrentThreshold(),
      shouldRecalibrate: shouldShowCalibration(),
      daysSinceCalibration: calibrationState.calibrationDate 
        ? Math.floor((Date.now() - new Date(calibrationState.calibrationDate).getTime()) / (1000 * 60 * 60 * 24))
        : null,
    };
  };

  return {
    // State
    isCalibrated: calibrationState.isCalibrated,
    personalizedThreshold: calibrationState.personalizedThreshold,
    calibrationDate: calibrationState.calibrationDate,
    
    // Actions
    saveCalibration,
    resetCalibration,
    getCurrentThreshold,
    shouldShowCalibration,
    getCalibrationInfo,
  };
};

export default useCalibration;
