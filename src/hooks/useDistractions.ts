import { useState, useEffect, useCallback, useRef } from 'react';
import useLocalSponsorImages from './useLocalSponsorImages';

interface DistractionContent {
  id: string;
  type: 'popup' | 'flash' | 'particle' | 'interactive' | 'sponsor' | 'image';
  content?: string;
  imageUrl?: string;
  duration: number;
  intensity: number;
  sponsorName?: string;
}

interface DistractionSchedule {
  gameTime: number; // when to trigger (in ms)
  difficulty: number; // 1-10 scale
}

const useDistractions = (gameStartTime: number | null, isGameActive: boolean) => {
  const [activeDistractions, setActiveDistractions] = useState<DistractionContent[]>([]);
  const [nextDistractionTime, setNextDistractionTime] = useState<number | null>(null);
  const [availableContent, setAvailableContent] = useState<DistractionContent[]>([]);
  
  const distractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gameTimeRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get local sponsor images
  const localImages = useLocalSponsorImages();

  // Fallback content if no local images available
  const distractionLibrary: DistractionContent[] = [
    {
      id: 'fallback1',
      type: 'popup',
      content: '🎮 Sample Ad - Add your images to /public/sponsors/',
      duration: 3000,
      intensity: 1
    }
  ];

  // Generate distraction schedule - memoized to prevent recreating
  const schedule = useRef<DistractionSchedule[]>([]);
  
  useEffect(() => {
    // Only generate once
    if (schedule.current.length === 0) {
      const newSchedule: DistractionSchedule[] = [];
      
      // Start at 10 seconds, escalate every 30 seconds
      let currentTime = 10000; // 10 seconds
      let difficulty = 1;
      
      // Generate distractions for first 10 minutes (typical game duration)
      while (currentTime < 600000) {
        newSchedule.push({
          gameTime: currentTime,
          difficulty: Math.min(difficulty, 10)
        });
        
        currentTime += 30000; // Every 30 seconds
        difficulty += 1; // Increase difficulty
      }
      
      schedule.current = newSchedule;
      console.log('📅 Generated distraction schedule:', newSchedule);
    }
  }, []);

  // Handle manual distraction removal
  const removeDistraction = useCallback((distractionId: string) => {
    setActiveDistractions(prev => prev.filter(d => d.id !== distractionId));
  }, []);

  // Load sponsor content when game starts (skip API for now, use local images only)
  useEffect(() => {
    if (isGameActive && gameStartTime) {
      console.log('🎮 Game started, using local images only');
      setAvailableContent([]); // Don't fetch from API for now
    }
  }, [isGameActive, gameStartTime]);

  // Main effect - manages distraction scheduling
  useEffect(() => {
    if (!isGameActive || !gameStartTime) {
      // Clear all timeouts when game is not active
      if (distractionTimeoutRef.current) {
        clearTimeout(distractionTimeoutRef.current);
        distractionTimeoutRef.current = null;
      }
      if (gameTimeRef.current) {
        clearTimeout(gameTimeRef.current);
        gameTimeRef.current = null;
      }
      setActiveDistractions([]);
      setNextDistractionTime(null);
      return;
    }

    console.log('🎮 Starting distraction system with', localImages.length, 'local images');
    console.log('📊 Local images:', localImages);
    
    // Start monitoring game time
    const updateGameTime = () => {
      const currentGameTime = Date.now() - gameStartTime;
      const nextDistraction = schedule.current.find(d => d.gameTime > currentGameTime);
      
      if (nextDistraction) {
        const timeUntilNext = nextDistraction.gameTime - currentGameTime;
        setNextDistractionTime(nextDistraction.gameTime);
        
        if (distractionTimeoutRef.current) {
          clearTimeout(distractionTimeoutRef.current);
        }
        
        console.log(`⏱️ Next distraction in ${timeUntilNext}ms (difficulty: ${nextDistraction.difficulty})`);
        
        distractionTimeoutRef.current = setTimeout(() => {
          console.log('🚀 Triggering distraction NOW');
          
          // Select from local images first
          const allContent = [...localImages, ...availableContent, ...distractionLibrary];
          console.log('📋 All available content:', allContent);
          const suitableDistractions = allContent.filter(d => d.intensity <= nextDistraction.difficulty);
          console.log('✅ Suitable distractions:', suitableDistractions);
          
          if (suitableDistractions.length > 0) {
            const selected = suitableDistractions[Math.floor(Math.random() * suitableDistractions.length)];
            const distraction = {
              ...selected,
              id: `${selected.id}_${Date.now()}`
            };
            
            console.log('📸 Selected distraction:', distraction);
            console.log('🎯 Setting active distractions');
            setActiveDistractions(prev => {
              console.log('📦 Previous distractions:', prev);
              const newDistractions = [...prev, distraction];
              console.log('📦 New distractions:', newDistractions);
              return newDistractions;
            });
            
            // Auto-remove after duration
            setTimeout(() => {
              console.log('⏰ Removing distraction after duration:', distraction.id);
              setActiveDistractions(prev => prev.filter(d => d.id !== distraction.id));
            }, distraction.duration);
          } else {
            console.warn('⚠️ No suitable distractions found!');
          }
        }, timeUntilNext);
      }
    };
    
    // Initial scheduling
    updateGameTime();
    
    // Set up periodic checks (every 10 seconds)
    gameTimeRef.current = setInterval(updateGameTime, 10000);

    return () => {
      if (distractionTimeoutRef.current) {
        clearTimeout(distractionTimeoutRef.current);
      }
      if (gameTimeRef.current) {
        clearInterval(gameTimeRef.current);
      }
    };
  }, [isGameActive, gameStartTime, localImages, availableContent]);

  // Manual trigger functions for debug
  const triggerTestDistraction = useCallback(() => {
    const testDistraction: DistractionContent = {
      id: `test_${Date.now()}`,
      type: 'popup',
      content: '🧪 Test Distraction',
      duration: 2000,
      intensity: 1
    };
    
    setActiveDistractions(prev => [...prev, testDistraction]);
    setTimeout(() => {
      removeDistraction(testDistraction.id);
    }, testDistraction.duration);
  }, [removeDistraction]);

  const triggerLightDistraction = useCallback(() => {
    console.log('🚀 Light distraction triggered!');
    console.log('📦 Available content:', [...localImages, ...distractionLibrary]);
    
    // Trigger 2 distractions
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        const allContent = [...localImages, ...distractionLibrary];
        console.log(`📦 Creating distraction ${i + 1}/2, available content:`, allContent.length);
        if (allContent.length > 0) {
          const selected = allContent[Math.floor(Math.random() * allContent.length)];
          const distraction = {
            ...selected,
            id: `light_${Date.now()}_${i}`,
            duration: 2000
          };
          
          console.log('🎯 Adding light distraction:', distraction);
          setActiveDistractions(prev => {
            console.log('Previous active distractions:', prev.length);
            const newList = [...prev, distraction];
            console.log('New active distractions:', newList.length);
            return newList;
          });
          setTimeout(() => {
            removeDistraction(distraction.id);
          }, distraction.duration);
        } else {
          console.warn('❌ No content available for light distraction');
        }
      }, i * 500);
    }
  }, [localImages, removeDistraction]);

  const triggerMediumDistraction = useCallback(() => {
    console.log('🚀 Medium distraction triggered!');
    console.log('📦 Available content:', [...localImages, ...distractionLibrary]);
    
    // Trigger 6 distractions
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const allContent = [...localImages, ...distractionLibrary];
        console.log(`📦 Creating distraction ${i + 1}/6, available content:`, allContent.length);
        if (allContent.length > 0) {
          const selected = allContent[Math.floor(Math.random() * allContent.length)];
          const distraction = {
            ...selected,
            id: `medium_${Date.now()}_${i}`,
            duration: 3000
          };
          
          console.log('🎯 Adding medium distraction:', distraction);
          setActiveDistractions(prev => [...prev, distraction]);
          setTimeout(() => {
            removeDistraction(distraction.id);
          }, distraction.duration);
        } else {
          console.warn('❌ No content available for medium distraction');
        }
      }, i * 300);
    }
  }, [localImages, removeDistraction]);

  const triggerHeavyDistraction = useCallback(() => {
    console.log('🚀 Heavy distraction triggered!');
    console.log('📦 Available content:', [...localImages, ...distractionLibrary]);
    
    // Trigger 15 distractions
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        const allContent = [...localImages, ...distractionLibrary];
        console.log(`📦 Creating distraction ${i + 1}/15, available content:`, allContent.length);
        if (allContent.length > 0) {
          const selected = allContent[Math.floor(Math.random() * allContent.length)];
          const distraction = {
            ...selected,
            id: `heavy_${Date.now()}_${i}`,
            duration: 4000
          };
          
          console.log('🎯 Adding heavy distraction:', distraction);
          setActiveDistractions(prev => [...prev, distraction]);
          setTimeout(() => {
            removeDistraction(distraction.id);
          }, distraction.duration);
        } else {
          console.warn('❌ No content available for heavy distraction');
        }
      }, i * 200);
    }
  }, [localImages, removeDistraction]);

  return {
    activeDistractions,
    nextDistractionTime,
    removeDistraction,
    triggerTestDistraction,
    triggerLightDistraction,
    triggerMediumDistraction,
    triggerHeavyDistraction
  };
};

export default useDistractions;