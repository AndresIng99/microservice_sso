import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit, Trash2, UserCheck, UserX } from 'lucide-react'
import { usersApi, type User } from '../services/users'
import UserTable from '../components/UserTable'
import UserForm from '../components/UserForm'

const Users = () => {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const queryClient = useQueryClient()

  // Query para obtener usuarios
  const { data: usersData, isLoading, error } = useQuery({
    queryKey: ['users', { page: currentPage, search }],
    queryFn: () => usersApi.getUsers({ 
      page: currentPage, 
      limit: 10,
      search: search || undefined 
    }),
  })

  // Mutación para eliminar usuario
  const deleteUserMutation = useMutation({
    mutationFn: usersApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  // Mutación para activar/desactivar usuario
  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return isActive ? usersApi.deactivateUser(id) : usersApi.activateUser(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const handleCreateUser = () => {
    setEditingUser(null)
    setIsFormOpen(true)
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setIsFormOpen(true)
  }

  const handleDeleteUser = async (id: number) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este usuario?')) {
      try {
        await deleteUserMutation.mutateAsync(id)
      } catch (error) {
        alert('Error al eliminar usuario')
      }
    }
  }

  const handleToggleStatus = async (user: User) => {
    const action = user.isActive ? 'desactivar' : 'activar'
    if (window.confirm(`¿Estás seguro de que deseas ${action} este usuario?`)) {
      try {
        await toggleUserStatusMutation.mutateAsync({
          id: user.id,
          isActive: user.isActive,
        })
      } catch (error) {
        alert(`Error al ${action} usuario`)
      }
    }
  }

  const handleFormSuccess = () => {
    setIsFormOpen(false)
    setEditingUser(null)
    queryClient.invalidateQueries({ queryKey: ['users'] })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-600">Gestión de usuarios del sistema</p>
        </div>
        <button
          onClick={handleCreateUser}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Usuario
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
              placeholder="Buscar usuarios..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1) // Reset to first page when searching
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-800">
                Error al cargar usuarios. Por favor, intenta nuevamente.
              </div>
            </div>
          </div>
        ) : (
          <UserTable
            users={usersData?.users || []}
            onEdit={handleEditUser}
            onDelete={handleDeleteUser}
            onToggleStatus={handleToggleStatus}
            isLoading={deleteUserMutation.isPending || toggleUserStatusMutation.isPending}
          />
        )}

        {/* Paginación */}
        {usersData?.pagination && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!usersData.pagination.hasPrev}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!usersData.pagination.hasNext}
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
                    {Math.min(currentPage * 10, usersData.pagination.total)}
                  </span>{' '}
                  de{' '}
                  <span className="font-medium">{usersData.pagination.total}</span>{' '}
                  resultados
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={!usersData.pagination.hasPrev}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                    Página {currentPage} de {usersData.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={!usersData.pagination.hasNext}
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
        <UserForm
          user={editingUser}
          onClose={() => {
            setIsFormOpen(false)
            setEditingUser(null)
          }}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  )
}

export default Users