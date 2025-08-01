import api from './api'

export interface User {
  id: number
  username: string
  email: string
  firstName: string
  lastName: string
  cedula?: string
  telefono?: string
  isActive: boolean
  createdAt: string
  lastLogin?: string
  roles: Role[]
}

export interface Role {
  id: number
  name: string
  description?: string
}

export interface CreateUserData {
  username: string
  email: string
  password: string
  firstName: string
  lastName: string
  cedula?: string
  telefono?: string
  roleIds?: number[]
}

export interface UpdateUserData {
  username?: string
  email?: string
  firstName?: string
  lastName?: string
  cedula?: string
  telefono?: string
  isActive?: boolean
  roleIds?: number[]
}

export interface UsersResponse {
  users: User[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// API de usuarios
export const usersApi = {
  // Obtener lista de usuarios
  getUsers: async (params?: {
    page?: number
    limit?: number
    search?: string
    isActive?: boolean
    roleId?: number
  }): Promise<UsersResponse> => {
    const response = await api.get('/users', { params })
    return response.data
  },

  // Obtener usuario por ID
  getUserById: async (id: number): Promise<User> => {
    const response = await api.get(`/users/${id}`)
    return response.data.user
  },

  // Crear usuario
  createUser: async (userData: CreateUserData): Promise<User> => {
    const response = await api.post('/users', userData)
    return response.data.user
  },

  // Actualizar usuario
  updateUser: async (id: number, userData: UpdateUserData): Promise<User> => {
    const response = await api.put(`/users/${id}`, userData)
    return response.data.user
  },

  // Eliminar usuario (soft delete)
  deleteUser: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}`)
  },

  // Activar usuario
  activateUser: async (id: number): Promise<void> => {
    await api.put(`/users/${id}/activate`)
  },

  // Desactivar usuario
  deactivateUser: async (id: number): Promise<void> => {
    await api.put(`/users/${id}/deactivate`)
  },

  // Cambiar contraseña
  changePassword: async (
    id: number,
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    await api.put(`/users/${id}/password`, {
      currentPassword,
      newPassword,
    })
  },

  // Obtener roles del usuario
  getUserRoles: async (id: number): Promise<Role[]> => {
    const response = await api.get(`/users/${id}/roles`)
    return response.data.roles
  },

  // Asignar roles al usuario
  assignRoles: async (id: number, roleIds: number[]): Promise<void> => {
    await api.put(`/users/${id}/roles`, { roleIds })
  },
}