import { supabase, TABLES, User } from '../lib/supabase'

export interface LeaderboardEntry {
  rank: number
  user: User
  win_rate: number
}

export interface LeaderboardFilter {
  period?: 'daily' | 'weekly' | 'monthly' | 'all-time'
  limit?: number
  offset?: number
}

export class LeaderboardService {
  /**
   * Get global leaderboard by win rate
   */
  static async getGlobalLeaderboard(filter: LeaderboardFilter = {}): Promise<LeaderboardEntry[]> {
    try {
      const { period = 'all-time', limit = 100, offset = 0 } = filter

      let query = supabase
        .from(TABLES.USERS)
        .select('*')
        .gte('total_matches', 1) // Only include users who have played at least one match
        .order('wins', { ascending: false })
        .range(offset, offset + limit - 1)

      // Apply time period filter if needed
      if (period !== 'all-time') {
        const dateFilter = this.getDateFilter(period)
        if (dateFilter) {
          // For time-based filtering, we'd need to join with matches table
          query = query.gte('updated_at', dateFilter)
        }
      }

      const { data: users, error } = await query

      if (error) {
        console.error('Get global leaderboard error:', error)
        return []
      }

      // Calculate win rates and add ranks
      const leaderboard: LeaderboardEntry[] = (users || []).map((user, index) => ({
        rank: offset + index + 1,
        user,
        win_rate: user.total_matches > 0 ? (user.wins / user.total_matches) * 100 : 0
      }))

      return leaderboard
    } catch (error) {
      console.error('Get global leaderboard error:', error)
      return []
    }
  }

  /**
   * Get top players by win streak
   */
  static async getTopStreaks(limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const { data: users, error } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .gte('total_matches', 1)
        .order('best_streak', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Get top streaks error:', error)
        return []
      }

      return (users || []).map((user, index) => ({
        rank: index + 1,
        user,
        win_rate: user.total_matches > 0 ? (user.wins / user.total_matches) * 100 : 0
      }))
    } catch (error) {
      console.error('Get top streaks error:', error)
      return []
    }
  }

  /**
   * Get most active players (by total matches)
   */
  static async getMostActivePlayers(limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const { data: users, error } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .gte('total_matches', 1)
        .order('total_matches', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Get most active players error:', error)
        return []
      }

      return (users || []).map((user, index) => ({
        rank: index + 1,
        user,
        win_rate: user.total_matches > 0 ? (user.wins / user.total_matches) * 100 : 0
      }))
    } catch (error) {
      console.error('Get most active players error:', error)
      return []
    }
  }

  /**
   * Get best continuous runs
   */
  static async getBestContinuousRuns(limit: number = 10): Promise<any[]> {
    try {
      const { data: runs, error } = await supabase
        .from(TABLES.CONTINUOUS_RUNS)
        .select(`
          *,
          user:users!continuous_runs_user_id_fkey(username)
        `)
        .order('opponents_defeated', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Get best continuous runs error:', error)
        return []
      }

      return runs || []
    } catch (error) {
      console.error('Get best continuous runs error:', error)
      return []
    }
  }

  /**
   * Get longest stares (individual match durations)
   */
  static async getLongestStares(limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const { data: users, error } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .gte('longest_stare', 1) // Only include users with recorded stares
        .order('longest_stare', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Get longest stares error:', error)
        return []
      }

      return (users || []).map((user, index) => ({
        rank: index + 1,
        user,
        win_rate: user.total_matches > 0 ? (user.wins / user.total_matches) * 100 : 0
      }))
    } catch (error) {
      console.error('Get longest stares error:', error)
      return []
    }
  }

  /**
   * Get recent activity (last 24 hours)
   */
  static async getRecentActivity(limit: number = 20): Promise<any[]> {
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const { data: matches, error } = await supabase
        .from(TABLES.MATCHES)
        .select(`
          *,
          player1:users!matches_player1_id_fkey(username),
          player2:users!matches_player2_id_fkey(username),
          winner:users!matches_winner_id_fkey(username)
        `)
        .gte('created_at', yesterday.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Get recent activity error:', error)
        return []
      }

      return matches || []
    } catch (error) {
      console.error('Get recent activity error:', error)
      return []
    }
  }

  /**
   * Helper function to get date filter for time periods
   */
  private static getDateFilter(period: string): string | null {
    const now = new Date()
    
    switch (period) {
      case 'daily':
        const daily = new Date(now)
        daily.setDate(daily.getDate() - 1)
        return daily.toISOString()
      
      case 'weekly':
        const weekly = new Date(now)
        weekly.setDate(weekly.getDate() - 7)
        return weekly.toISOString()
      
      case 'monthly':
        const monthly = new Date(now)
        monthly.setMonth(monthly.getMonth() - 1)
        return monthly.toISOString()
      
      default:
        return null
    }
  }

  /**
   * Get leaderboard statistics
   */
  static async getLeaderboardStats(): Promise<{
    totalPlayers: number
    totalMatches: number
    highestWinRate: number
    longestStreak: number
  }> {
    try {
      // Get total players
      const { data: players, error: playersError } = await supabase
        .from(TABLES.USERS)
        .select('id', { count: 'exact' })
        .gte('total_matches', 1)

      // Get total matches
      const { data: matches, error: matchesError } = await supabase
        .from(TABLES.MATCHES)
        .select('id', { count: 'exact' })

      // Get highest win rate and longest streak
      const { data: userStats, error: statsError } = await supabase
        .from(TABLES.USERS)
        .select('wins, total_matches, best_streak')
        .gte('total_matches', 1)

      if (playersError || matchesError || statsError) {
        console.error('Get leaderboard stats error:', { playersError, matchesError, statsError })
        return {
          totalPlayers: 0,
          totalMatches: 0,
          highestWinRate: 0,
          longestStreak: 0
        }
      }

      const totalPlayers = players?.length || 0
      const totalMatches = matches?.length || 0
      
      // Calculate highest win rate
      const highestWinRate = userStats?.reduce((max, user) => {
        const winRate = user.total_matches > 0 ? (user.wins / user.total_matches) * 100 : 0
        return Math.max(max, winRate)
      }, 0) || 0
      
      // Calculate longest streak
      const longestStreak = userStats?.reduce((max, user) => 
        Math.max(max, user.best_streak)
      , 0) || 0

      return {
        totalPlayers,
        totalMatches,
        highestWinRate,
        longestStreak
      }
    } catch (error) {
      console.error('Get leaderboard stats error:', error)
      return {
        totalPlayers: 0,
        totalMatches: 0,
        highestWinRate: 0,
        longestStreak: 0
      }
    }
  }
}
