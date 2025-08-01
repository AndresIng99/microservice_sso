import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  Shield, 
  Server, 
  LogOut,
  User
} from 'lucide-react'
import { useAuthStore } from '../services/auth'

const Sidebar = () => {
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      current: location.pathname === '/dashboard',
    },
    {
      name: 'Usuarios',
      href: '/users',
      icon: Users,
      current: location.pathname === '/users',
    },
    {
      name: 'Roles',
      href: '/roles',
      icon: Shield,
      current: location.pathname === '/roles',
    },
    {
      name: 'Microservicios',
      href: '/microservices',
      icon: Server,
      current: location.pathname === '/microservices',
    },
  ]

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="flex flex-col w-64 bg-white shadow-lg">
      {/* Logo/Header */}
      <div className="flex items-center justify-center h-16 px-4 bg-primary-600">
        <h2 className="text-white text-lg font-semibold">Auth System</h2>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                item.current
                  ? 'bg-primary-100 text-primary-700 border-r-2 border-primary-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon
                className={`mr-3 h-5 w-5 ${
                  item.current ? 'text-primary-700' : 'text-gray-400 group-hover:text-gray-500'
                }`}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User info y logout */}
      <div className="border-t border-gray-200 p-4">
        {/* Info del usuario */}
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {user?.username}
            </p>
          </div>
        </div>

        {/* Botón de logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  )
}

export default Sidebar