import { supabase, TABLES, User } from '../lib/supabase'

export interface UserStats {
  userId: string
  username: string
  totalMatches: number
  wins: number
  losses: number
  winRate: number
  currentStreak: number
  bestStreak: number
  averageMatchDuration: number
  totalPlayTime: number
  favoriteGameMode: string
  recentPerformance: {
    last10Matches: number
    last20Matches: number
    last50Matches: number
  }
  achievements: {
    firstWin: boolean
    streak5: boolean
    streak10: boolean
    matches10: boolean
    matches50: boolean
    matches100: boolean
  }
}

export interface GlobalStats {
  totalPlayers: number
  totalMatches: number
  highestWinRate: number
  longestStreak: number
  mostActivePlayer: string
  averageMatchDuration: number
  popularGameMode: string
  recentActivity: {
    matchesToday: number
    matchesThisWeek: number
    newPlayersToday: number
  }
}

export class StatsService {
  /**
   * Get comprehensive user statistics
   */
  static async getUserStats(userId: string): Promise<UserStats | null> {
    try {
      // Get user profile
      const { data: user } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .eq('id', userId)
        .single()

      if (!user) {
        return null
      }

      // Get match history for additional stats
      const { data: matches } = await supabase
        .from(TABLES.MATCHES)
        .select('*')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)

      // Calculate additional statistics
      const totalPlayTime = matches?.reduce((total, match) => total + match.match_duration, 0) || 0
      const averageMatchDuration = matches && matches.length > 0 
        ? Math.round(totalPlayTime / matches.length) 
        : 0

      // Calculate game mode preferences
      const gameModeCounts: Record<string, number> = {}
      matches?.forEach(match => {
        gameModeCounts[match.game_mode] = (gameModeCounts[match.game_mode] || 0) + 1
      })
      
      const favoriteGameMode = Object.entries(gameModeCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown'

      // Calculate recent performance
      const recentMatches = matches?.slice(0, 50) || []
      const last10Matches = recentMatches.slice(0, 10)
      const last20Matches = recentMatches.slice(0, 20)
      const last50Matches = recentMatches

      const calculateWinRate = (matchList: any[]) => {
        if (matchList.length === 0) return 0
        const wins = matchList.filter(match => match.winner_id === userId).length
        return (wins / matchList.length) * 100
      }

      // Check achievements
      const achievements = {
        firstWin: user.wins > 0,
        streak5: user.best_streak >= 5,
        streak10: user.best_streak >= 10,
        matches10: user.total_matches >= 10,
        matches50: user.total_matches >= 50,
        matches100: user.total_matches >= 100
      }

      return {
        userId: user.id,
        username: user.username,
        totalMatches: user.total_matches,
        wins: user.wins,
        losses: user.losses,
        winRate: user.total_matches > 0 ? (user.wins / user.total_matches) * 100 : 0,
        currentStreak: user.current_streak,
        bestStreak: user.best_streak,
        averageMatchDuration,
        totalPlayTime,
        favoriteGameMode,
        recentPerformance: {
          last10Matches: calculateWinRate(last10Matches),
          last20Matches: calculateWinRate(last20Matches),
          last50Matches: calculateWinRate(last50Matches)
        },
        achievements
      }
    } catch (error) {
      console.error('Get user stats error:', error)
      return null
    }
  }

  /**
   * Get global statistics
   */
  static async getGlobalStats(): Promise<GlobalStats> {
    try {
      // Get basic stats
      const { data: players } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .gte('total_matches', 1)

      const { data: matches } = await supabase
        .from(TABLES.MATCHES)
        .select('*')

      const { data: recentPlayers } = await supabase
        .from(TABLES.USERS)
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

      const { data: recentMatches } = await supabase
        .from(TABLES.MATCHES)
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

      const { data: weeklyMatches } = await supabase
        .from(TABLES.MATCHES)
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

      // Calculate statistics
      const totalPlayers = players?.length || 0
      const totalMatches = matches?.length || 0

      const mostActivePlayer = players?.reduce((most, player) => 
        player.total_matches > (most?.total_matches || 0) ? player : most
      )?.username || 'Unknown'

      const longestStreak = players?.reduce((max, player) => 
        Math.max(max, player.best_streak)
      , 0) || 0

      const averageMatchDuration = matches && matches.length > 0
        ? Math.round(matches.reduce((sum, match) => sum + match.match_duration, 0) / matches.length)
        : 0

      // Calculate popular game mode
      const gameModeCounts: Record<string, number> = {}
      matches?.forEach(match => {
        gameModeCounts[match.game_mode] = (gameModeCounts[match.game_mode] || 0) + 1
      })
      
      const popularGameMode = Object.entries(gameModeCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown'

      // Calculate highest win rate
      const highestWinRate = players?.reduce((max, player) => {
        const winRate = player.total_matches > 0 ? (player.wins / player.total_matches) * 100 : 0
        return Math.max(max, winRate)
      }, 0) || 0

      return {
        totalPlayers,
        totalMatches,
        highestWinRate,
        longestStreak,
        mostActivePlayer,
        averageMatchDuration,
        popularGameMode,
        recentActivity: {
          matchesToday: recentMatches?.length || 0,
          matchesThisWeek: weeklyMatches?.length || 0,
          newPlayersToday: recentPlayers?.length || 0
        }
      }
    } catch (error) {
      console.error('Get global stats error:', error)
      return {
        totalPlayers: 0,
        totalMatches: 0,
        highestWinRate: 0,
        longestStreak: 0,
        mostActivePlayer: 'Unknown',
        averageMatchDuration: 0,
        popularGameMode: 'unknown',
        recentActivity: {
          matchesToday: 0,
          matchesThisWeek: 0,
          newPlayersToday: 0
        }
      }
    }
  }

  /**
   * Get user progression over time
   */
  static async getUserProgression(userId: string): Promise<{
    dates: string[]
    winRates: number[]
  }> {
    try {
      const { data: matches } = await supabase
        .from(TABLES.MATCHES)
        .select('winner_id, created_at')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order('created_at', { ascending: true })

      // Process win rate progression
      const dates: string[] = []
      const winRates: number[] = []

      if (matches) {
        // Calculate cumulative win rate over time
        matches.forEach((match, index) => {
          const date = match.created_at.split('T')[0]
          
          // Calculate cumulative win rate up to this point
          const matchesSoFar = matches.slice(0, index + 1)
          const winsSoFar = matchesSoFar.filter(m => m.winner_id === userId).length
          const winRateSoFar = matchesSoFar.length > 0 ? (winsSoFar / matchesSoFar.length) * 100 : 0
          
          dates.push(date)
          winRates.push(winRateSoFar)
        })
      }

      return {
        dates: dates.slice(-30), // Last 30 data points
        winRates: winRates.slice(-30)
      }
    } catch (error) {
      console.error('Get user progression error:', error)
      return {
        dates: [],
        winRates: []
      }
    }
  }

  /**
   * Compare user stats with global averages
   */
  static async compareWithGlobal(userId: string): Promise<{
    winRateComparison: number
    activityComparison: number
  }> {
    try {
      const userStats = await this.getUserStats(userId)
      const globalStats = await this.getGlobalStats()

      if (!userStats) {
        return {
          winRateComparison: 0,
          activityComparison: 0
        }
      }

      const winRateComparison = userStats.winRate - 50 // Assuming 50% is average
      
      // Activity comparison based on matches played vs average
      const averageMatchesPerPlayer = globalStats.totalMatches / Math.max(globalStats.totalPlayers, 1)
      const activityComparison = userStats.totalMatches - averageMatchesPerPlayer

      return {
        winRateComparison,
        activityComparison
      }
    } catch (error) {
      console.error('Compare with global error:', error)
      return {
        winRateComparison: 0,
        activityComparison: 0
      }
    }
  }
}
