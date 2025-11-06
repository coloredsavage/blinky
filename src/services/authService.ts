import { supabase, TABLES, User } from '../lib/supabase'

export interface AuthResult {
  success: boolean
  user?: User
  error?: string
}

export interface RegisterData {
  username: string
  email: string
  password: string
}

export interface LoginData {
  email: string
  password: string
}

export class AuthService {
  /**
   * Register a new user
   */
  static async register(data: RegisterData): Promise<AuthResult> {
    try {
      // Validate username
      if (!data.username || data.username.length < 2) {
        return { success: false, error: 'Username must be at least 2 characters' }
      }

      if (data.username.length > 20) {
        return { success: false, error: 'Username must be less than 20 characters' }
      }

      // Check if username already exists
      const { data: existingUser } = await supabase
        .from(TABLES.USERS)
        .select('id')
        .eq('username', data.username)
        .single()

      if (existingUser) {
        return { success: false, error: 'Username already exists' }
      }

      // Create user with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            username: data.username
          }
        }
      })

      if (authError) {
        return { success: false, error: authError.message }
      }

      if (!authData.user) {
        return { success: false, error: 'Failed to create user' }
      }

      // Create user profile in database
      const { data: userProfile, error: profileError } = await supabase
        .from(TABLES.USERS)
        .insert({
          id: authData.user.id,
          username: data.username,
          email: data.email,
          total_matches: 0,
          wins: 0,
          losses: 0,
          best_streak: 0,
          current_streak: 0
        })
        .select()
        .single()

      if (profileError) {
        // Clean up auth user if profile creation fails
        await supabase.auth.admin.deleteUser(authData.user.id)
        return { success: false, error: 'Failed to create user profile' }
      }

      return { success: true, user: userProfile }
    } catch (error) {
      console.error('Registration error:', error)
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  /**
   * Login user
   */
  static async login(data: LoginData): Promise<AuthResult> {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password
      })

      if (authError) {
        return { success: false, error: authError.message }
      }

      if (!authData.user) {
        return { success: false, error: 'Login failed' }
      }

      // Get user profile
      const { data: userProfile, error: profileError } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .eq('id', authData.user.id)
        .single()

      if (profileError) {
        return { success: false, error: 'Failed to load user profile' }
      }

      return { success: true, user: userProfile }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  /**
   * Logout user
   */
  static async logout(): Promise<void> {
    await supabase.auth.signOut()
  }

  /**
   * Get current user session
   */
  static async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (!authUser) {
        return null
      }

      const { data: userProfile } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .eq('id', authUser.id)
        .single()

      return userProfile
    } catch (error) {
      console.error('Get current user error:', error)
      return null
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser()
    return user !== null
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, updates: Partial<User>): Promise<AuthResult> {
    try {
      const { data: updatedUser, error } = await supabase
        .from(TABLES.USERS)
        .update(updates)
        .eq('id', userId)
        .select()
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, user: updatedUser }
    } catch (error) {
      console.error('Update profile error:', error)
      return { success: false, error: 'Failed to update profile' }
    }
  }

  /**
   * Reset password
   */
  static async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      
      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      console.error('Reset password error:', error)
      return { success: false, error: 'Failed to send reset email' }
    }
  }
}
