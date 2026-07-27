import { createContext, useContext } from 'react'

export interface AuthUser {
  id: string
  email?: string
  created_at?: string
  email_confirmed_at?: string | null
  user_metadata?: Record<string, unknown>
}

export interface AuthContextValue {
  user: AuthUser
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth debe utilizarse dentro de AuthContext.')
  }
  return value
}
