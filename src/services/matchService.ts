import { supabase, TABLES, GAME_MODES, Match, ContinuousRun } from '../lib/supabase'

export interface MatchResult {
  player1Id: string
  player2Id: string
  winnerId: string | null
  gameMode: string
  matchDuration: number
  player1Blinks: number
  player2Blinks: number
}

export interface ContinuousRunResult {
  userId: string
  opponentsDefeated: number
  runDuration: number
}

export class MatchService {
  /**
   * Record a completed match
   */
  static async recordMatch(result: MatchResult): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current stats for both players
      const { data: player1 } = await supabase
        .from(TABLES.USERS)
        .select('wins, losses, current_streak, best_streak')
        .eq('id', result.player1Id)
        .single()

      const { data: player2 } = await supabase
        .from(TABLES.USERS)
        .select('wins, losses, current_streak, best_streak')
        .eq('id', result.player2Id)
        .single()

      if (!player1 || !player2) {
        return { success: false, error: 'Player not found' }
      }

      const player1Won = result.winnerId === result.player1Id
      const player2Won = result.winnerId === result.player2Id

      // Update player stats
      const player1Updates = {
        total_matches: player1.wins + player1.losses + 1,
        wins: player1Won ? player1.wins + 1 : player1.wins,
        losses: !player1Won ? player1.losses + 1 : player1.losses,
        current_streak: player1Won ? player1.current_streak + 1 : 0,
        best_streak: player1Won ? Math.max(player1.best_streak, player1.current_streak + 1) : player1.best_streak
      }

      const player2Updates = {
        total_matches: player2.wins + player2.losses + 1,
        wins: player2Won ? player2.wins + 1 : player2.wins,
        losses: !player2Won ? player2.losses + 1 : player2.losses,
        current_streak: player2Won ? player2.current_streak + 1 : 0,
        best_streak: player2Won ? Math.max(player2.best_streak, player2.current_streak + 1) : player2.best_streak
      }

      // Record the match
      const { data: match, error: matchError } = await supabase
        .from(TABLES.MATCHES)
        .insert({
          player1_id: result.player1Id,
          player2_id: result.player2Id,
          winner_id: result.winnerId,
          game_mode: result.gameMode,
          match_duration: result.matchDuration,
          player1_blinks: result.player1Blinks,
          player2_blinks: result.player2Blinks
        })
        .select()
        .single()

      if (matchError) {
        return { success: false, error: matchError.message }
      }

      // Update player profiles
      await supabase
        .from(TABLES.USERS)
        .update(player1Updates)
        .eq('id', result.player1Id)

      await supabase
        .from(TABLES.USERS)
        .update(player2Updates)
        .eq('id', result.player2Id)

      return { success: true }
    } catch (error) {
      console.error('Record match error:', error)
      return { success: false, error: 'Failed to record match' }
    }
  }

  /**
   * Record a continuous run
   */
  static async recordContinuousRun(result: ContinuousRunResult): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: run, error } = await supabase
        .from(TABLES.CONTINUOUS_RUNS)
        .insert({
          user_id: result.userId,
          opponents_defeated: result.opponentsDefeated,
          run_duration: result.runDuration
        })
        .select()
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      console.error('Record continuous run error:', error)
      return { success: false, error: 'Failed to record continuous run' }
    }
  }

  /**
   * Get match history for a user
   */
  static async getMatchHistory(userId: string, limit: number = 20): Promise<Match[]> {
    try {
      const { data: matches, error } = await supabase
        .from(TABLES.MATCHES)
        .select(`
          *,
          player1:users!matches_player1_id_fkey(username),
          player2:users!matches_player2_id_fkey(username),
          winner:users!matches_winner_id_fkey(username)
        `)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Get match history error:', error)
        return []
      }

      return matches || []
    } catch (error) {
      console.error('Get match history error:', error)
      return []
    }
  }

  /**
   * Get continuous run history for a user
   */
  static async getContinuousRunHistory(userId: string, limit: number = 10): Promise<ContinuousRun[]> {
    try {
      const { data: runs, error } = await supabase
        .from(TABLES.CONTINUOUS_RUNS)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Get continuous run history error:', error)
        return []
      }

      return runs || []
    } catch (error) {
      console.error('Get continuous run history error:', error)
      return []
    }
  }
}
