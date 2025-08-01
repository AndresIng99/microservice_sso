import axios from 'axios'
import { useAuthStore } from './auth'

// Configuración base de axios
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor para agregar token de autorización
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Interceptor para manejo de respuestas y errores
api.interceptors.response.use(
  (response) => {
    return response
  },
  async (error) => {
    const originalRequest = error.config

    // Si el token ha expirado (401) y no estamos ya renovando
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = useAuthStore.getState().refreshToken
        
        if (refreshToken) {
          const response = await axios.post(
            `${import.meta.env.VITE_API_URL || 'http://localhost/api'}/auth/refresh`,
            { refreshToken }
          )
          
          const { accessToken } = response.data
          useAuthStore.getState().setTokens(accessToken, refreshToken)
          
          // Reintentar la petición original con el nuevo token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return api(originalRequest)
        }
      } catch (refreshError) {
        // Si no se puede renovar el token, cerrar sesión
        useAuthStore.getState().logout()
      }
    }

    return Promise.reject(error)
  }
)

export default api