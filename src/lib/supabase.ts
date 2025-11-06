import { createClient } from '@supabase/supabase-js'

// These environment variables need to be set in your .env.local file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase environment variables not set. Database features will be disabled.')
  console.warn('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file')
}

// Create Supabase client
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
)

// Database table names
export const TABLES = {
  USERS: 'users',
  MATCHES: 'matches',
  CONTINUOUS_RUNS: 'continuous_runs'
} as const

// Game modes
export const GAME_MODES = {
  SINGLE: 'single',
  MULTIPLAYER: 'multiplayer',
  GLOBAL: 'global'
} as const

// Types for database operations
export interface User {
  id: string
  username: string
  email: string
  total_matches: number
  wins: number
  losses: number
  best_streak: number
  current_streak: number
  longest_stare: number
  created_at: string
  updated_at: string
}

export interface Match {
  id: string
  player1_id: string
  player2_id: string
  winner_id: string | null
  game_mode: string
  match_duration: number
  player1_blinks: number
  player2_blinks: number
  created_at: string
}

export interface ContinuousRun {
  id: string
  user_id: string
  opponents_defeated: number
  run_duration: number
  created_at: string
}
