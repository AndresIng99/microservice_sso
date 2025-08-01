import api from './api'

export interface Role {
  id: number
  name: string
  description?: string
  permissions: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
  userCount?: number
}

export interface CreateRoleData {
  name: string
  description?: string
  permissions: string[]
}

export interface UpdateRoleData {
  name?: string
  description?: string
  permissions?: string[]
  isActive?: boolean
}

export interface RolesResponse {
  roles: Role[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface PermissionsResponse {
  permissions: {
    all: string[]
    grouped: {
      users: string[]
      roles: string[]
      microservices: string[]
      system: string[]
      dashboard: string[]
      profile: string[]
      special: string[]
    }
  }
}

// API de roles
export const rolesApi = {
  // Obtener lista de roles
  getRoles: async (params?: {
    page?: number
    limit?: number
    search?: string
    isActive?: boolean
  }): Promise<RolesResponse> => {
    const response = await api.get('/roles', { params })
    return response.data
  },

  // Obtener rol por ID
  getRoleById: async (id: number): Promise<Role> => {
    const response = await api.get(`/roles/${id}`)
    return response.data.role
  },

  // Crear rol
  createRole: async (roleData: CreateRoleData): Promise<Role> => {
    const response = await api.post('/roles', roleData)
    return response.data.role
  },

  // Actualizar rol
  updateRole: async (id: number, roleData: UpdateRoleData): Promise<Role> => {
    const response = await api.put(`/roles/${id}`, roleData)
    return response.data.role
  },

  // Eliminar rol
  deleteRole: async (id: number): Promise<void> => {
    await api.delete(`/roles/${id}`)
  },

  // Activar rol
  activateRole: async (id: number): Promise<void> => {
    await api.put(`/roles/${id}/activate`)
  },

  // Desactivar rol
  deactivateRole: async (id: number): Promise<void> => {
    await api.put(`/roles/${id}/deactivate`)
  },

  // Obtener usuarios con este rol
  getRoleUsers: async (id: number): Promise<any[]> => {
    const response = await api.get(`/roles/${id}/users`)
    return response.data.users
  },

  // Obtener permisos disponibles
  getAvailablePermissions: async (): Promise<PermissionsResponse> => {
    const response = await api.get('/roles/permissions')
    return response.data
  },
}