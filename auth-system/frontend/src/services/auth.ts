import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from './api'

export interface User {
  id: number
  username: string
  email: string
  firstName: string
  lastName: string
  permissions: string[]
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        try {
          const response = await api.post('/auth/login', {
            username,
            password,
          })

          const { user, accessToken, refreshToken } = response.data

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
          })
        } catch (error: any) {
          throw new Error(error.response?.data?.error || 'Error en el login')
        }
      },

      logout: async () => {
        try {
          const { refreshToken } = get()
          if (refreshToken) {
            await api.post('/auth/logout', { refreshToken })
          }
        } catch (error) {
          // Ignorar errores en logout
          console.warn('Error al cerrar sesión:', error)
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          })
        }
      },

      setTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken })
      },

      setUser: (user: User) => {
        set({ user })
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)