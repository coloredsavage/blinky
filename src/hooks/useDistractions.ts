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
      
      // Start at 20 seconds, escalate every 15 seconds
      let currentTime = 20000; // 20 seconds - first distraction
      let difficulty = 1;
      
      // Generate distractions for first 10 minutes (typical game duration)
      while (currentTime < 600000) {
        newSchedule.push({
          gameTime: currentTime,
          difficulty: Math.min(difficulty, 10)
        });
        
        // Progressive escalation - shorter intervals as difficulty increases
        const intervalReduction = Math.min(difficulty * 2000, 10000); // Max 10s reduction
        currentTime += Math.max(15000 - intervalReduction, 3000); // Min 3s between distractions
        difficulty += 1; // Increase difficulty
      }
      
      schedule.current = newSchedule;
      console.log('📅 Generated distraction schedule (starts at 20s):', newSchedule);
    }
  }, []);

  // Handle manual distraction removal
  const removeDistraction = useCallback((distractionId: string) => {
    setActiveDistractions(prev => prev.filter(d => d.id !== distractionId));
  }, []);

  // Clear all distractions
  const clearAllDistractions = useCallback(() => {
    console.log('🧹 Clearing all distractions');
    setActiveDistractions([]);
  }, []);

  // Fetch GIFs from Tenor API
  const fetchWebGifs = useCallback(async () => {
    try {
      const TENOR_API_KEY = 'AIzaSyAY0bwEO-dTO6Yilmm_9HMgjrj4swmffOo';
      const distractionKeywords = [
        'funny cat', 'dancing', 'explosion', 'sparkles', 
        'neon', 'rainbow', 'glitch', 'hypnotic', 'spinning',
        'flash', 'disco', 'party', 'wow', 'amazing'
      ];
      
      const randomKeyword = distractionKeywords[Math.floor(Math.random() * distractionKeywords.length)];
      console.log('🎬 Fetching GIFs for keyword:', randomKeyword);
      
      const response = await fetch(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(randomKeyword)}&key=${TENOR_API_KEY}&client_key=blinky_game&limit=10&media_filter=gif&contentfilter=medium`
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log('🎬 Tenor API response:', data);
        
        const gifContent: DistractionContent[] = data.results.map((gif: any, index: number) => ({
          id: `gif_${gif.id}`,
          type: 'image' as const,
          imageUrl: gif.media_formats.gif.url || gif.media_formats.tinygif.url,
          content: '', // Remove the title - just use empty string
          duration: 3000 + (index * 500), // Vary duration 3-8 seconds
          intensity: Math.ceil((index + 1) / 2), // Intensity 1-5
          sponsorName: 'Powered by Tenor'
        }));
        
        console.log('🎬 Generated GIF content with IDs:', gifContent.map(g => g.id));
        
        console.log('✅ Loaded GIFs from web:', gifContent.length);
        setAvailableContent(gifContent);
      } else {
        console.warn('⚠️ Failed to fetch GIFs from Tenor:', response.status);
        setAvailableContent([]);
      }
    } catch (error) {
      console.error('❌ Error fetching GIFs:', error);
      setAvailableContent([]);
    }
  }, []);

  // Load sponsor content when game starts - now includes web GIFs
  useEffect(() => {
    if (isGameActive && gameStartTime) {
      console.log('🎮 Game started, fetching web GIFs...');
      fetchWebGifs();
    }
  }, [isGameActive, gameStartTime, fetchWebGifs]);

  // Also fetch GIFs on component mount for test buttons
  useEffect(() => {
    console.log('🎬 Component mounted, pre-fetching GIFs for test buttons...');
    fetchWebGifs();
  }, [fetchWebGifs]);

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
    console.log('📦 Available content:', [...localImages, ...availableContent, ...distractionLibrary]);
    
    const allContent = [...localImages, ...availableContent, ...distractionLibrary];
    if (allContent.length === 0) {
      console.warn('❌ No content available for light distraction');
      return;
    }

    // Generate all distractions at once to avoid timing issues
    const baseTime = Date.now();
    const newDistractions = [];
    
    for (let i = 0; i < 2; i++) {
      const selected = allContent[Math.floor(Math.random() * allContent.length)];
      const distraction = {
        ...selected,
        id: selected.id?.startsWith('gif_') ? `${selected.id}_light_${baseTime}_${i}` : `light_${baseTime}_${i}`,
        duration: 2000
      };
      newDistractions.push(distraction);
    }
    
    console.log('🎯 Adding light distractions:', newDistractions);
    setActiveDistractions(prev => [...prev, ...newDistractions]);
    
    // No automatic removal - let them stick until manually closed
  }, [localImages, availableContent, removeDistraction]);

  const triggerMediumDistraction = useCallback(() => {
    console.log('🚀 Medium distraction triggered!');
    console.log('📦 Available content:', [...localImages, ...availableContent, ...distractionLibrary]);
    
    const allContent = [...localImages, ...availableContent, ...distractionLibrary];
    if (allContent.length === 0) {
      console.warn('❌ No content available for medium distraction');
      return;
    }

    // Generate all distractions at once to avoid timing issues
    const baseTime = Date.now();
    const newDistractions = [];
    
    for (let i = 0; i < 6; i++) {
      const selected = allContent[Math.floor(Math.random() * allContent.length)];
      const distraction = {
        ...selected,
        id: selected.id?.startsWith('gif_') ? `${selected.id}_medium_${baseTime}_${i}` : `medium_${baseTime}_${i}`,
        duration: 3000
      };
      newDistractions.push(distraction);
    }
    
    console.log('🎯 Adding medium distractions:', newDistractions);
    setActiveDistractions(prev => [...prev, ...newDistractions]);
    
    // No automatic removal - let them stick until manually closed
  }, [localImages, availableContent, removeDistraction]);

  const triggerHeavyDistraction = useCallback(() => {
    console.log('🚀 Heavy distraction triggered!');
    console.log('📦 Available content:', [...localImages, ...availableContent, ...distractionLibrary]);
    
    const allContent = [...localImages, ...availableContent, ...distractionLibrary];
    if (allContent.length === 0) {
      console.warn('❌ No content available for heavy distraction');
      return;
    }

    // Generate all distractions at once to avoid timing issues
    const baseTime = Date.now();
    const newDistractions = [];
    
    for (let i = 0; i < 15; i++) {
      const selected = allContent[Math.floor(Math.random() * allContent.length)];
      const distraction = {
        ...selected,
        id: selected.id?.startsWith('gif_') ? `${selected.id}_heavy_${baseTime}_${i}` : `heavy_${baseTime}_${i}`,
        duration: 4000
      };
      newDistractions.push(distraction);
    }
    
    console.log('🎯 Adding heavy distractions:', newDistractions);
    setActiveDistractions(prev => [...prev, ...newDistractions]);
    
    // No automatic removal - let them stick until manually closed
  }, [localImages, availableContent, removeDistraction]);

  return {
    activeDistractions,
    nextDistractionTime,
    removeDistraction,
    clearAllDistractions,
    triggerTestDistraction,
    triggerLightDistraction,
    triggerMediumDistraction,
    triggerHeavyDistraction
  };
};

export default useDistractions;