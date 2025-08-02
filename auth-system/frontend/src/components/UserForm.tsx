// REEMPLAZA COMPLETAMENTE: auth-system/frontend/src/components/UserForm.tsx

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, Eye, EyeOff } from 'lucide-react'
import { usersApi, type User, type CreateUserData, type UpdateUserData } from '../services/users'
import { rolesApi } from '../services/roles'

const createUserSchema = z.object({
  username: z.string().min(3, 'Username debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string()
    .min(8, 'Password debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Password debe tener al menos una letra mayúscula')
    .regex(/[a-z]/, 'Password debe tener al menos una letra minúscula')
    .regex(/\d/, 'Password debe tener al menos un número'),
  firstName: z.string().min(1, 'Nombre es requerido'),
  lastName: z.string().min(1, 'Apellido es requerido'),
  cedula: z.string().optional(),
  telefono: z.string().optional(),
  roleIds: z.array(z.number()).optional(),
})

const updateUserSchema = createUserSchema.omit({ password: true }).extend({
  password: z.string()
    .min(8, 'Password debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Password debe tener al menos una letra mayúscula')
    .regex(/[a-z]/, 'Password debe tener al menos una letra minúscula')
    .regex(/\d/, 'Password debe tener al menos un número')
    .optional()
    .or(z.literal('')),
})

type FormData = z.infer<typeof createUserSchema>

interface UserFormProps {
  user?: User | null
  onClose: () => void
  onSuccess: () => void
}

const UserForm = ({ user, onClose, onSuccess }: UserFormProps) => {
  const [showPassword, setShowPassword] = useState(false)
  const [passwordValue, setPasswordValue] = useState('')
  const isEditing = !!user

  // Query para obtener roles disponibles
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.getRoles({ limit: 100 }),
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    defaultValues: {
      username: user?.username || '',
      email: user?.email || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      cedula: user?.cedula || '',
      telefono: user?.telefono || '',
      roleIds: user?.roles.map(role => role.id) || [],
    },
  })

  const selectedRoleIds = watch('roleIds')

  // Función para validar si la contraseña cumple todos los requisitos
  const isPasswordValid = (password: string) => {
    if (!password && isEditing) return true; // En edición, contraseña vacía es válida
    if (!password && !isEditing) return false; // En creación, contraseña es requerida
    
    return password.length >= 8 &&
           /[A-Z]/.test(password) &&
           /[a-z]/.test(password) &&
           /\d/.test(password);
  }

  // Mutación para crear/actualizar usuario
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (isEditing && user) {
        const updateData: UpdateUserData = {
          username: data.username,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          cedula: data.cedula,
          telefono: data.telefono,
          roleIds: data.roleIds,
        }
        if (data.password && data.password.trim() !== '') {
          updateData.password = data.password
        }
        return usersApi.updateUser(user.id, updateData)
      } else {
        const createData: CreateUserData = {
          username: data.username,
          email: data.email,
          password: data.password!,
          firstName: data.firstName,
          lastName: data.lastName,
          cedula: data.cedula,
          telefono: data.telefono,
          roleIds: data.roleIds,
        }
        return usersApi.createUser(createData)
      }
    },
    onSuccess: () => {
      onSuccess()
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  const handleRoleToggle = (roleId: number) => {
    const currentRoles = selectedRoleIds || []
    const newRoles = currentRoles.includes(roleId)
      ? currentRoles.filter(id => id !== roleId)
      : [...currentRoles, roleId]
    setValue('roleIds', newRoles)
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">
            {isEditing ? 'Editar Usuario' : 'Crear Usuario'}
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
                Username *
              </label>
              <input
                {...register('username')}
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                {...register('email')}
                type="email"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nombre *
              </label>
              <input
                {...register('firstName')}
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              {errors.firstName && (
                <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Apellido *
              </label>
              <input
                {...register('lastName')}
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              {errors.lastName && (
                <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Cédula
              </label>
              <input
                {...register('cedula')}
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Teléfono
              </label>
              <input
                {...register('telefono')}
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contraseña {!isEditing && '*'}
              {isEditing && (
                <span className="text-gray-500 text-xs">(dejar vacío para mantener la actual)</span>
              )}
            </label>
            <div className="mt-1 relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 pr-10 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                onChange={(e) => {
                  register('password').onChange(e);
                  setPasswordValue(e.target.value);
                }}
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-500 focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            
            {/* Validaciones de contraseña en tiempo real */}
            {(passwordValue || errors.password) && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-gray-700">Requisitos de contraseña:</p>
                <div className="space-y-1">
                  <div className={`flex items-center space-x-2 text-xs ${
                    passwordValue && passwordValue.length >= 8 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <span>{passwordValue && passwordValue.length >= 8 ? '✓' : '✗'}</span>
                    <span>Mínimo 8 caracteres</span>
                  </div>
                  <div className={`flex items-center space-x-2 text-xs ${
                    passwordValue && /[A-Z]/.test(passwordValue) ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <span>{passwordValue && /[A-Z]/.test(passwordValue) ? '✓' : '✗'}</span>
                    <span>Al menos una letra mayúscula</span>
                  </div>
                  <div className={`flex items-center space-x-2 text-xs ${
                    passwordValue && /[a-z]/.test(passwordValue) ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <span>{passwordValue && /[a-z]/.test(passwordValue) ? '✓' : '✗'}</span>
                    <span>Al menos una letra minúscula</span>
                  </div>
                  <div className={`flex items-center space-x-2 text-xs ${
                    passwordValue && /\d/.test(passwordValue) ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <span>{passwordValue && /\d/.test(passwordValue) ? '✓' : '✗'}</span>
                    <span>Al menos un número</span>
                  </div>
                </div>
              </div>
            )}
            
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          {/* Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Roles
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rolesData?.roles.map((role) => (
                <label key={role.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedRoleIds?.includes(role.id) || false}
                    onChange={() => handleRoleToggle(role.id)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    {role.name}
                    {role.description && (
                      <span className="text-gray-500"> - {role.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Error message */}
          {mutation.error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">
                {mutation.error instanceof Error ? mutation.error.message : 'Error al guardar usuario'}
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
              disabled={
                mutation.isPending || 
                (!isEditing && !isPasswordValid(passwordValue))
              }
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

export default UserForm