import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Search, Edit, Trash2, Shield, Users, X } from 'lucide-react'
import { rolesApi, type Role, type CreateRoleData, type UpdateRoleData } from '../services/roles'

const roleSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
})

type RoleFormData = z.infer<typeof roleSchema>

const Roles = () => {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const queryClient = useQueryClient()

  // Query para obtener roles
  const { data: rolesData, isLoading, error } = useQuery({
    queryKey: ['roles', { page: currentPage, search }],
    queryFn: () => rolesApi.getRoles({ 
      page: currentPage, 
      limit: 10,
      search: search || undefined 
    }),
  })

  // Query para obtener permisos disponibles
  const { data: permissionsData } = useQuery({
    queryKey: ['permissions'],
    queryFn: rolesApi.getAvailablePermissions,
  })

  // Mutación para eliminar rol
  const deleteRoleMutation = useMutation({
    mutationFn: rolesApi.deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })

  // Mutación para activar/desactivar rol
  const toggleRoleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return isActive ? rolesApi.deactivateRole(id) : rolesApi.activateRole(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })

  const handleCreateRole = () => {
    setEditingRole(null)
    setIsFormOpen(true)
  }

  const handleEditRole = (role: Role) => {
    setEditingRole(role)
    setIsFormOpen(true)
  }

  const handleDeleteRole = async (id: number) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este rol?')) {
      try {
        await deleteRoleMutation.mutateAsync(id)
      } catch (error) {
        alert('Error al eliminar rol')
      }
    }
  }

  const handleToggleStatus = async (role: Role) => {
    const action = role.isActive ? 'desactivar' : 'activar'
    if (window.confirm(`¿Estás seguro de que deseas ${action} este rol?`)) {
      try {
        await toggleRoleStatusMutation.mutateAsync({
          id: role.id,
          isActive: role.isActive,
        })
      } catch (error) {
        alert(`Error al ${action} rol`)
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
          <p className="text-gray-600">Gestión de roles y permisos del sistema</p>
        </div>
        <button
          onClick={handleCreateRole}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Rol
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="p-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Buscar roles..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabla de roles */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-800">
                Error al cargar roles. Por favor, intenta nuevamente.
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Permisos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuarios
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rolesData?.roles.map((role) => (
                  <tr key={role.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <Shield className="h-8 w-8 text-primary-600" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {role.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {role.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {role.description || 'Sin descripción'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {role.permissions.length} permisos
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {role.permissions.slice(0, 3).map((permission) => (
                          <span
                            key={permission}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                          >
                            {permission}
                          </span>
                        ))}
                        {role.permissions.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{role.permissions.length - 3} más
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          role.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {role.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <Users className="h-4 w-4 mr-1" />
                        {role.userCount || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditRole(role)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Editar rol"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(role)}
                          className={`${
                            role.isActive
                              ? 'text-red-600 hover:text-red-900'
                              : 'text-green-600 hover:text-green-900'
                          }`}
                          title={role.isActive ? 'Desactivar rol' : 'Activar rol'}
                        >
                          <Shield className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRole(role.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Eliminar rol"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rolesData?.roles.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-500">No se encontraron roles</div>
              </div>
            )}
          </div>
        )}

        {/* Paginación */}
        {rolesData?.pagination && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!rolesData.pagination.hasPrev}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!rolesData.pagination.hasNext}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Mostrando{' '}
                  <span className="font-medium">
                    {(currentPage - 1) * 10 + 1}
                  </span>{' '}
                  a{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * 10, rolesData.pagination.total)}
                  </span>{' '}
                  de{' '}
                  <span className="font-medium">{rolesData.pagination.total}</span>{' '}
                  resultados
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={!rolesData.pagination.hasPrev}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                    Página {currentPage} de {rolesData.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={!rolesData.pagination.hasNext}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de formulario */}
      {isFormOpen && (
        <RoleForm
          role={editingRole}
          permissions={permissionsData?.permissions}
          onClose={() => {
            setIsFormOpen(false)
            setEditingRole(null)
          }}
          onSuccess={() => {
            setIsFormOpen(false)
            setEditingRole(null)
            queryClient.invalidateQueries({ queryKey: ['roles'] })
          }}
        />
      )}
    </div>
  )
}

// Componente del formulario de roles
const RoleForm = ({ role, permissions, onClose, onSuccess }: {
  role?: Role | null
  permissions?: any
  onClose: () => void
  onSuccess: () => void
}) => {
  const isEditing = !!role

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: role?.name || '',
      description: role?.description || '',
      permissions: role?.permissions || [],
    },
  })

  const selectedPermissions = watch('permissions')

  const mutation = useMutation({
    mutationFn: async (data: RoleFormData) => {
      if (isEditing && role) {
        const updateData: UpdateRoleData = {
          name: data.name,
          description: data.description,
          permissions: data.permissions,
        }
        return rolesApi.updateRole(role.id, updateData)
      } else {
        const createData: CreateRoleData = {
          name: data.name,
          description: data.description,
          permissions: data.permissions,
        }
        return rolesApi.createRole(createData)
      }
    },
    onSuccess: () => {
      onSuccess()
    },
  })

  const onSubmit = (data: RoleFormData) => {
    mutation.mutate(data)
  }

  const handlePermissionToggle = (permission: string) => {
    const current = selectedPermissions || []
    const updated = current.includes(permission)
      ? current.filter(p => p !== permission)
      : [...current, permission]
    setValue('permissions', updated)
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">
            {isEditing ? 'Editar Rol' : 'Crear Rol'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Información básica */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nombre del Rol *
              </label>
              <input
                {...register('name')}
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Ej: editor, moderador, analista"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Descripción
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Describe las responsabilidades de este rol..."
              />
            </div>
          </div>

          {/* Permisos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Permisos ({selectedPermissions?.length || 0} seleccionados)
            </label>
            
            {permissions?.grouped && (
              <div className="space-y-4">
                {Object.entries(permissions.grouped).map(([category, categoryPermissions]: [string, any]) => (
                  <div key={category} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3 capitalize">
                      {category.replace('_', ' ')}
                    </h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {categoryPermissions.map((permission: string) => (
                        <label key={permission} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedPermissions?.includes(permission) || false}
                            onChange={() => handlePermissionToggle(permission)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">
                            {permission}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error message */}
          {mutation.error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">
                {mutation.error instanceof Error ? mutation.error.message : 'Error al guardar rol'}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending
                ? 'Guardando...'
                : isEditing
                ? 'Actualizar'
                : 'Crear'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Roles