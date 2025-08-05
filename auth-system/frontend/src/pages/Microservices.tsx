import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Server, 
  Activity, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  X,
  ExternalLink 
} from 'lucide-react'
import api from '../services/api'

interface Microservice {
  id: number
  name: string
  description?: string
  url: string
  version: string
  isActive: boolean
  isHealthy: boolean
  lastHealthCheck?: string
  healthCheckUrl?: string
  expectedResponse?: string
  requiresAuth: boolean
  allowedRoles: string[]
  createdAt: string
  updatedAt: string
}

interface MicroservicesResponse {
  microservices: Microservice[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

const microserviceSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  description: z.string().optional(),
  url: z.string().url('URL inválida'),
  version: z.string().optional().default('1.0.0'),
  healthCheckUrl: z.string().optional().or(z.literal('')),
  expectedResponse: z.string().optional(),
  requiresAuth: z.boolean().default(true),
  allowedRoles: z.array(z.string()).default([]),
})

type MicroserviceFormData = z.infer<typeof microserviceSchema>

const Microservices = () => {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingService, setEditingService] = useState<Microservice | null>(null)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const queryClient = useQueryClient()

  // API functions
  const microservicesApi = {
    getMicroservices: async (params?: {
      page?: number
      limit?: number
      search?: string
      isActive?: boolean
      isHealthy?: boolean
    }): Promise<MicroservicesResponse> => {
      const response = await api.get('/microservices', { params })
      return response.data
    },

    createMicroservice: async (data: MicroserviceFormData): Promise<Microservice> => {
      const response = await api.post('/microservices', data)
      return response.data.microservice
    },

    updateMicroservice: async (id: number, data: Partial<MicroserviceFormData>): Promise<Microservice> => {
      const response = await api.put(`/microservices/${id}`, data)
      return response.data.microservice
    },

    deleteMicroservice: async (id: number): Promise<void> => {
      await api.delete(`/microservices/${id}`)
    },

    performHealthCheck: async (id: number): Promise<any> => {
      const response = await api.post(`/microservices/${id}/health-check`)
      return response.data.result
    },

    performHealthCheckAll: async (): Promise<any> => {
      const response = await api.post('/microservices/health-check-all')
      return response.data
    },

    activateMicroservice: async (id: number): Promise<void> => {
      await api.put(`/microservices/${id}/activate`)
    },

    deactivateMicroservice: async (id: number): Promise<void> => {
      await api.put(`/microservices/${id}/deactivate`)
    },
  }

  // Query para obtener microservicios
  const { data: servicesData, isLoading, error } = useQuery({
    queryKey: ['microservices', { page: currentPage, search }],
    queryFn: () => microservicesApi.getMicroservices({ 
      page: currentPage, 
      limit: 10,
      search: search || undefined 
    }),
  })

  // Mutaciones
  const deleteServiceMutation = useMutation({
    mutationFn: microservicesApi.deleteMicroservice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microservices'] })
    },
  })

  const toggleServiceStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return isActive ? microservicesApi.deactivateMicroservice(id) : microservicesApi.activateMicroservice(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microservices'] })
    },
  })

  const healthCheckMutation = useMutation({
    mutationFn: microservicesApi.performHealthCheck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microservices'] })
    },
  })

  const healthCheckAllMutation = useMutation({
    mutationFn: microservicesApi.performHealthCheckAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microservices'] })
    },
  })

  const handleCreateService = () => {
    setEditingService(null)
    setIsFormOpen(true)
  }

  const handleEditService = (service: Microservice) => {
    setEditingService(service)
    setIsFormOpen(true)
  }

  const handleDeleteService = async (id: number) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este microservicio?')) {
      try {
        await deleteServiceMutation.mutateAsync(id)
      } catch (error) {
        alert('Error al eliminar microservicio')
      }
    }
  }

  const handleToggleStatus = async (service: Microservice) => {
    const action = service.isActive ? 'desactivar' : 'activar'
    if (window.confirm(`¿Estás seguro de que deseas ${action} este microservicio?`)) {
      try {
        await toggleServiceStatusMutation.mutateAsync({
          id: service.id,
          isActive: service.isActive,
        })
      } catch (error) {
        alert(`Error al ${action} microservicio`)
      }
    }
  }

  const handleHealthCheck = async (id: number) => {
    try {
      await healthCheckMutation.mutateAsync(id)
    } catch (error) {
      alert('Error al realizar health check')
    }
  }

  const handleHealthCheckAll = async () => {
    try {
      await healthCheckAllMutation.mutateAsync()
    } catch (error) {
      alert('Error al realizar health check masivo')
    }
  }

  const handleFormSuccess = () => {
    setIsFormOpen(false)
    setEditingService(null)
    queryClient.invalidateQueries({ queryKey: ['microservices'] })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Microservicios</h1>
          <p className="text-gray-600">Gestión y monitoreo de microservicios del ecosistema</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleHealthCheckAll}
            disabled={healthCheckAllMutation.isPending}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${healthCheckAllMutation.isPending ? 'animate-spin' : ''}`} />
            Health Check All
          </button>
          <button
            onClick={handleCreateService}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Microservicio
          </button>
        </div>
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
              placeholder="Buscar microservicios..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabla de microservicios */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-800">
                Error al cargar microservicios. Por favor, intenta nuevamente.
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Servicio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    URL
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Health
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Último Check
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {servicesData?.microservices.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <Server className="h-8 w-8 text-primary-600" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {service.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            v{service.version}
                          </div>
                          {service.description && (
                            <div className="text-xs text-gray-400 max-w-xs truncate">
                              {service.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-900 font-mono">
                          {service.url}
                        </span>
                        <a
                          href={service.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      {service.requiresAuth && (
                        <div className="text-xs text-blue-600 mt-1">
                          🔒 Requiere autenticación
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          service.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {service.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {service.isActive ? (
                          service.isHealthy ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )
                        ) : (
                          <Activity className="h-5 w-5 text-gray-400" />
                        )}
                        <span className={`ml-2 text-sm ${
                          service.isActive 
                            ? service.isHealthy 
                              ? 'text-green-600' 
                              : 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {service.isActive 
                            ? service.isHealthy 
                              ? 'Saludable' 
                              : 'Con problemas'
                            : 'Inactivo'
                          }
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {service.lastHealthCheck 
                        ? new Date(service.lastHealthCheck).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Nunca'
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleHealthCheck(service.id)}
                          disabled={healthCheckMutation.isPending}
                          className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                          title="Realizar health check"
                        >
                          <RefreshCw className={`h-4 w-4 ${
                            healthCheckMutation.isPending ? 'animate-spin' : ''
                          }`} />
                        </button>
                        <button
                          onClick={() => handleEditService(service)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Editar microservicio"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(service)}
                          disabled={toggleServiceStatusMutation.isPending}
                          className={`${
                            service.isActive
                              ? 'text-red-600 hover:text-red-900'
                              : 'text-green-600 hover:text-green-900'
                          } disabled:opacity-50`}
                          title={service.isActive ? 'Desactivar' : 'Activar'}
                        >
                          <Activity className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteService(service.id)}
                          disabled={deleteServiceMutation.isPending}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          title="Eliminar microservicio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {servicesData?.microservices.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-500">No se encontraron microservicios</div>
              </div>
            )}
          </div>
        )}

        {/* Paginación */}
        {servicesData?.pagination && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!servicesData.pagination.hasPrev}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!servicesData.pagination.hasNext}
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
                    {Math.min(currentPage * 10, servicesData.pagination.total)}
                  </span>{' '}
                  de{' '}
                  <span className="font-medium">{servicesData.pagination.total}</span>{' '}
                  resultados
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={!servicesData.pagination.hasPrev}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                    Página {currentPage} de {servicesData.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={!servicesData.pagination.hasNext}
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
        <MicroserviceForm
          service={editingService}
          onClose={() => {
            setIsFormOpen(false)
            setEditingService(null)
          }}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  )
}

// Componente del formulario de microservicios - VERSIÓN CORREGIDA
const MicroserviceForm = ({ service, onClose, onSuccess }: {
  service?: Microservice | null
  onClose: () => void
  onSuccess: () => void
}) => {
  const isEditing = !!service
  const [allowedRolesString, setAllowedRolesString] = useState(
    service?.allowedRoles?.join(', ') || ''
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<MicroserviceFormData>({
    resolver: zodResolver(microserviceSchema),
    defaultValues: {
      name: service?.name || '',
      description: service?.description || '',
      url: service?.url || '',
      version: service?.version || '1.0.0',
      healthCheckUrl: service?.healthCheckUrl || '',
      expectedResponse: service?.expectedResponse || '',
      requiresAuth: service?.requiresAuth ?? true,
      allowedRoles: service?.allowedRoles || [],
    },
  })

  const requiresAuth = watch('requiresAuth')

  const microservicesApi = {
    createMicroservice: async (data: MicroserviceFormData): Promise<Microservice> => {
      const response = await api.post('/microservices', data)
      return response.data.microservice
    },

    updateMicroservice: async (id: number, data: Partial<MicroserviceFormData>): Promise<Microservice> => {
      const response = await api.put(`/microservices/${id}`, data)
      return response.data.microservice
    },
  }

  const mutation = useMutation({
    mutationFn: async (data: MicroserviceFormData) => {
      console.log('Datos a enviar:', data)
      
      const payload = {
        ...data,
        healthCheckUrl: data.healthCheckUrl || undefined,
        expectedResponse: data.expectedResponse || undefined,
      }

      if (isEditing && service) {
        return microservicesApi.updateMicroservice(service.id, payload)
      } else {
        return microservicesApi.createMicroservice(payload)
      }
    },
    onSuccess: () => {
      onSuccess()
    },
    onError: (error) => {
      console.error('Error en mutación:', error)
    }
  })

  const onSubmit = (data: MicroserviceFormData) => {
    console.log('Formulario enviado:', data)
    mutation.mutate(data)
  }

  const handleAllowedRolesChange = (value: string) => {
    setAllowedRolesString(value)
    const roles = value.split(',').map(r => r.trim()).filter(Boolean)
    setValue('allowedRoles', roles, { shouldValidate: true })
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">
            {isEditing ? 'Editar Microservicio' : 'Crear Microservicio'}
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nombre *
              </label>
              <input
                {...register('name')}
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Mi Microservicio"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Versión
              </label>
              <input
                {...register('version')}
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="1.0.0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Descripción
            </label>
            <textarea
              {...register('description')}
              rows={3}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="Describe la funcionalidad de este microservicio..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              URL *
            </label>
            <input
              {...register('url')}
              type="url"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="http://localhost:8000"
            />
            {errors.url && (
              <p className="mt-1 text-sm text-red-600">{errors.url.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              URL de Health Check
            </label>
            <input
              {...register('healthCheckUrl')}
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="http://localhost:8000/health (opcional)"
            />
            {errors.healthCheckUrl && (
              <p className="mt-1 text-sm text-red-600">{errors.healthCheckUrl.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Respuesta Esperada
            </label>
            <input
              {...register('expectedResponse')}
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="OK, healthy, etc. (opcional)"
            />
            <p className="mt-1 text-sm text-gray-500">
              Texto que debe contener la respuesta para considerarse saludable
            </p>
          </div>

          {/* Configuración de autenticación */}
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                {...register('requiresAuth')}
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-900">
                Requiere autenticación
              </label>
            </div>

            {requiresAuth && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Roles permitidos (separados por comas)
                </label>
                <input
                  type="text"
                  value={allowedRolesString}
                  onChange={(e) => handleAllowedRolesChange(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="admin,user,editor"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Ejemplo: admin, user, editor
                </p>
              </div>
            )}
          </div>

          {/* Debug info - remover en producción */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-gray-50 p-3 rounded text-xs">
              <p><strong>Debug:</strong></p>
              <p>Errors: {JSON.stringify(errors)}</p>
              <p>Mutation pending: {mutation.isPending.toString()}</p>
              <p>Form valid: {Object.keys(errors).length === 0 ? 'true' : 'false'}</p>
            </div>
          )}

          {/* Error message */}
          {mutation.error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">
                {mutation.error instanceof Error ? mutation.error.message : 'Error al guardar microservicio'}
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

export default Microservices