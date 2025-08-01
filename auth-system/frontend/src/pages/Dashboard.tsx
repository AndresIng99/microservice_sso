import { useQuery } from '@tanstack/react-query'
import { Users, Shield, Server, Activity } from 'lucide-react'
import api from '../services/api'

interface DashboardData {
  userStats: {
    total: number
    active: number
    inactive: number
  }
  roleStats: {
    total: number
    active: number
    inactive: number
  }
  microserviceStats: {
    total: number
    active: number
    inactive: number
    healthy: number
    unhealthy: number
  }
  systemHealth: {
    status: string
    uptime: number
    database: string
  }
}

const Dashboard = () => {
  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await api.get('/dashboard')
      return response.data
    },
    refetchInterval: 30000, // Actualizar cada 30 segundos
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="text-red-800">
          Error al cargar el dashboard. Por favor, intenta nuevamente.
        </div>
      </div>
    )
  }

  const stats = [
    {
      name: 'Usuarios Totales',
      value: dashboardData?.userStats.total || 0,
      subtitle: `${dashboardData?.userStats.active || 0} activos`,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      name: 'Roles Activos',
      value: dashboardData?.roleStats.active || 0,
      subtitle: `${dashboardData?.roleStats.total || 0} total`,
      icon: Shield,
      color: 'bg-green-500',
    },
    {
      name: 'Microservicios',
      value: dashboardData?.microserviceStats.active || 0,
      subtitle: `${dashboardData?.microserviceStats.healthy || 0} saludables`,
      icon: Server,
      color: 'bg-purple-500',
    },
    {
      name: 'Estado del Sistema',
      value: dashboardData?.systemHealth.status === 'healthy' ? 'Saludable' : 'Error',
      subtitle: `Uptime: ${Math.floor((dashboardData?.systemHealth.uptime || 0) / 60)} min`,
      icon: Activity,
      color: dashboardData?.systemHealth.status === 'healthy' ? 'bg-green-500' : 'bg-red-500',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Métricas importantes del sistema de autenticación</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.name}
              className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200"
            >
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`${stat.color} rounded-md p-3`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-4 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {stat.name}
                      </dt>
                      <dd className="text-lg font-semibold text-gray-900">
                        {stat.value}
                      </dd>
                      <dd className="text-sm text-gray-500">
                        {stat.subtitle}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detalles adicionales */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Resumen de usuarios */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Usuarios</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total de usuarios:</span>
                <span className="text-sm font-medium text-gray-900">
                  {dashboardData?.userStats.total || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Usuarios activos:</span>
                <span className="text-sm font-medium text-green-600">
                  {dashboardData?.userStats.active || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Usuarios inactivos:</span>
                <span className="text-sm font-medium text-red-600">
                  {dashboardData?.userStats.inactive || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Resumen de microservicios */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Microservicios</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total de servicios:</span>
                <span className="text-sm font-medium text-gray-900">
                  {dashboardData?.microserviceStats.total || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Servicios activos:</span>
                <span className="text-sm font-medium text-blue-600">
                  {dashboardData?.microserviceStats.active || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Servicios saludables:</span>
                <span className="text-sm font-medium text-green-600">
                  {dashboardData?.microserviceStats.healthy || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Servicios con problemas:</span>
                <span className="text-sm font-medium text-red-600">
                  {dashboardData?.microserviceStats.unhealthy || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Estado del sistema */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Estado del Sistema</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="text-center">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                dashboardData?.systemHealth.status === 'healthy'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {dashboardData?.systemHealth.status === 'healthy' ? 'Saludable' : 'Error'}
              </div>
              <p className="text-xs text-gray-500 mt-1">Estado general</p>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">
                {Math.floor((dashboardData?.systemHealth.uptime || 0) / 60)} min
              </div>
              <p className="text-xs text-gray-500">Tiempo activo</p>
            </div>
            <div className="text-center">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                dashboardData?.systemHealth.database === 'healthy'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {dashboardData?.systemHealth.database === 'healthy' ? 'Conectada' : 'Error'}
              </div>
              <p className="text-xs text-gray-500 mt-1">Base de datos</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard