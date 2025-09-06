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

  // Game timing refs
  const adScheduleRef = useRef<NodeJS.Timeout[]>([]);
  const gifScheduleRef = useRef<NodeJS.Timeout[]>([]);

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

  // Main effect - implements new game mechanics
  useEffect(() => {
    if (!isGameActive || !gameStartTime) {
      // Clear all scheduled distractions
      adScheduleRef.current.forEach(timeout => clearTimeout(timeout));
      gifScheduleRef.current.forEach(timeout => clearTimeout(timeout));
      adScheduleRef.current = [];
      gifScheduleRef.current = [];
      setActiveDistractions([]);
      setNextDistractionTime(null);
      return;
    }

    console.log('🎮 Starting new distraction mechanics: 2 ads at 20s, then 1 every 5s. GIFs random.');
    
    const adContent = [...localImages, ...distractionLibrary]; // Ads only
    const gifContent = availableContent; // GIFs only
    
    // Schedule first 2 ads at 20 seconds
    const firstAdTimeout = setTimeout(() => {
      console.log('🚀 Adding first 2 ads at 20 seconds');
      for (let i = 0; i < 2; i++) {
        if (adContent.length > 0) {
          const selected = adContent[Math.floor(Math.random() * adContent.length)];
          const adDistraction = {
            ...selected,
            id: `game_ad_${Date.now()}_${i}`,
            type: 'sponsor' as const // Ensure it's treated as ad
          };
          
          setActiveDistractions(prev => [...prev, adDistraction]);
        }
      }
      
      // Schedule recurring ads every 5 seconds after the initial 2
      const recurringAdInterval = setInterval(() => {
        console.log('🚀 Adding recurring ad');
        if (adContent.length > 0) {
          const selected = adContent[Math.floor(Math.random() * adContent.length)];
          const adDistraction = {
            ...selected,
            id: `game_ad_${Date.now()}_recurring`,
            type: 'sponsor' as const
          };
          
          setActiveDistractions(prev => [...prev, adDistraction]);
        }
      }, 5000);
      
      adScheduleRef.current.push(recurringAdInterval as any);
    }, 20000);
    
    adScheduleRef.current.push(firstAdTimeout);
    
    // Schedule random GIFs - come and go at random intervals
    const scheduleRandomGif = () => {
      const randomDelay = Math.random() * 10000 + 5000; // 5-15 seconds random
      const gifTimeout = setTimeout(() => {
        if (gifContent.length > 0) {
          const selected = gifContent[Math.floor(Math.random() * gifContent.length)];
          const gifDistraction = {
            ...selected,
            id: `${selected.id}_${Date.now()}`, // Preserve gif_ prefix
            duration: 3000 + Math.random() * 4000 // 3-7 second duration
          };
          
          console.log('🎬 Adding random GIF:', gifDistraction.id);
          setActiveDistractions(prev => [...prev, gifDistraction]);
          
          // Auto-remove GIF after its duration
          setTimeout(() => {
            console.log('⏰ Removing GIF after duration:', gifDistraction.id);
            setActiveDistractions(prev => prev.filter(d => d.id !== gifDistraction.id));
          }, gifDistraction.duration);
        }
        
        // Schedule next random GIF
        scheduleRandomGif();
      }, randomDelay);
      
      gifScheduleRef.current.push(gifTimeout);
    };
    
    // Start random GIF scheduling after 25 seconds (after initial ads)
    const startGifTimeout = setTimeout(() => {
      scheduleRandomGif();
    }, 25000);
    
    gifScheduleRef.current.push(startGifTimeout);

    return () => {
      adScheduleRef.current.forEach(timeout => clearTimeout(timeout));
      gifScheduleRef.current.forEach(timeout => clearTimeout(timeout));
      adScheduleRef.current = [];
      gifScheduleRef.current = [];
    };
  }, [isGameActive, gameStartTime, localImages, availableContent, distractionLibrary]);

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