import { useState, useEffect, useCallback } from 'react';

interface AnonymousSession {
  id: string;
  username: string;
  gamesPlayed: number;
  totalTime: number;
  bestScore: number;
  createdAt: number;
  lastPlayedAt: number;
}

const STORAGE_KEY = 'blinky-anonymous-session';

const useSession = (initialUsername?: string) => {
  const [session, setSession] = useState<AnonymousSession | null>(null);

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedSession = JSON.parse(stored);
        setSession(parsedSession);
        console.log('📂 Loaded existing session:', parsedSession);
      } else if (initialUsername) {
        // Create new session if we have an initial username
        createNewSession(initialUsername);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      if (initialUsername) {
        createNewSession(initialUsername);
      }
    }
  }, [initialUsername]);

  const createNewSession = useCallback((username: string) => {
    const newSession: AnonymousSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      username: username.trim(),
      gamesPlayed: 0,
      totalTime: 0,
      bestScore: 0,
      createdAt: Date.now(),
      lastPlayedAt: Date.now()
    };
    
    setSession(newSession);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      console.log('✨ Created new session:', newSession);
    } catch (error) {
      console.error('Failed to save session:', error);
    }
    
    return newSession;
  }, []);

  const updateSessionStats = useCallback((gameTime: number, didWin: boolean) => {
    if (!session) {
      console.warn('No session to update');
      return;
    }

    const updatedSession: AnonymousSession = {
      ...session,
      gamesPlayed: session.gamesPlayed + 1,
      totalTime: session.totalTime + gameTime,
      bestScore: didWin && gameTime > session.bestScore ? gameTime : session.bestScore,
      lastPlayedAt: Date.now()
    };

    setSession(updatedSession);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));
      console.log('📊 Updated session stats:', updatedSession);
    } catch (error) {
      console.error('Failed to save session stats:', error);
    }
  }, [session]);

  const updateUsername = useCallback((newUsername: string) => {
    if (!session || !newUsername.trim()) return;

    const updatedSession = {
      ...session,
      username: newUsername.trim(),
      lastPlayedAt: Date.now()
    };

    setSession(updatedSession);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));
      console.log('👤 Updated username:', updatedSession);
    } catch (error) {
      console.error('Failed to save username update:', error);
    }
  }, [session]);

  const clearSession = useCallback(() => {
    setSession(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log('🗑️ Cleared session');
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }, []);

  const getOrCreateSession = useCallback((username: string) => {
    if (session) {
      // Update existing session username if different
      if (session.username !== username.trim()) {
        updateUsername(username);
      }
      return session;
    } else {
      return createNewSession(username);
    }
  }, [session, updateUsername, createNewSession]);

  return {
    session,
    createNewSession,
    updateSessionStats,
    updateUsername,
    clearSession,
    getOrCreateSession
  };
};

export default useSession;