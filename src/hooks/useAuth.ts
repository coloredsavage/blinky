import { useState, useEffect, useCallback } from 'react'
import { AuthService, AuthResult, RegisterData, LoginData } from '../services/authService'
import { User } from '../lib/supabase'

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    error: null
  })

  // Load current user on mount
  useEffect(() => {
    loadCurrentUser()
  }, [])

  const loadCurrentUser = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }))
      
      const user = await AuthService.getCurrentUser()
      
      setAuthState({
        user,
        isLoading: false,
        isAuthenticated: !!user,
        error: null
      })
    } catch (error) {
      console.error('Failed to load current user:', error)
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: 'Failed to load user session'
      })
    }
  }, [])

  const register = useCallback(async (data: RegisterData): Promise<AuthResult> => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }))
      
      const result = await AuthService.register(data)
      
      if (result.success && result.user) {
        setAuthState({
          user: result.user,
          isLoading: false,
          isAuthenticated: true,
          error: null
        })
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Registration failed'
        }))
      }
      
      return result
    } catch (error) {
      console.error('Registration error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Registration failed'
      setAuthState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
      return { success: false, error: errorMessage }
    }
  }, [])

  const login = useCallback(async (data: LoginData): Promise<AuthResult> => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }))
      
      const result = await AuthService.login(data)
      
      if (result.success && result.user) {
        setAuthState({
          user: result.user,
          isLoading: false,
          isAuthenticated: true,
          error: null
        })
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Login failed'
        }))
      }
      
      return result
    } catch (error) {
      console.error('Login error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Login failed'
      setAuthState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
      return { success: false, error: errorMessage }
    }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }))
      
      await AuthService.logout()
      
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null
      })
    } catch (error) {
      console.error('Logout error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Logout failed'
      setAuthState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
    }
  }, [])

  const updateProfile = useCallback(async (updates: Partial<User>): Promise<AuthResult> => {
    try {
      if (!authState.user) {
        return { success: false, error: 'No user logged in' }
      }

      setAuthState(prev => ({ ...prev, isLoading: true, error: null }))
      
      const result = await AuthService.updateProfile(authState.user.id, updates)
      
      if (result.success && result.user) {
        setAuthState(prev => ({
          ...prev,
          user: result.user!,
          isLoading: false,
          error: null
        }))
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Profile update failed'
        }))
      }
      
      return result
    } catch (error) {
      console.error('Update profile error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed'
      setAuthState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
      return { success: false, error: errorMessage }
    }
  }, [authState.user])

  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }))
      
      const result = await AuthService.resetPassword(email)
      
      setAuthState(prev => ({ ...prev, isLoading: false }))
      
      return result
    } catch (error) {
      console.error('Reset password error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Password reset failed'
      setAuthState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
      return { success: false, error: errorMessage }
    }
  }, [])

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }))
  }, [])

  return {
    // State
    user: authState.user,
    isLoading: authState.isLoading,
    isAuthenticated: authState.isAuthenticated,
    error: authState.error,
    
    // Actions
    register,
    login,
    logout,
    updateProfile,
    resetPassword,
    clearError,
    reloadUser: loadCurrentUser
  }
}
