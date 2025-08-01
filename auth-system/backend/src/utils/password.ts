import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// Hash de contraseña
export async function hashPassword(password: string): Promise<string> {
  try {
    return await bcrypt.hash(password, BCRYPT_ROUNDS);
  } catch (error) {
    throw new Error('Error al encriptar contraseña');
  }
}

// Verificar contraseña
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    throw new Error('Error al verificar contraseña');
  }
}

// Validar política de contraseñas
export function validatePasswordPolicy(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Mínimo 8 caracteres
  if (password.length < 8) {
    errors.push('La contraseña debe tener al menos 8 caracteres');
  }

  // Al menos una mayúscula
  if (!/[A-Z]/.test(password)) {
    errors.push('La contraseña debe tener al menos una letra mayúscula');
  }

  // Al menos una minúscula
  if (!/[a-z]/.test(password)) {
    errors.push('La contraseña debe tener al menos una letra minúscula');
  }

  // Al menos un número
  if (!/\d/.test(password)) {
    errors.push('La contraseña debe tener al menos un número');
  }

  // Opcional: Al menos un carácter especial
  // if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
  //   errors.push('La contraseña debe tener al menos un carácter especial');
  // }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Generar contraseña aleatoria
export function generateRandomPassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const specials = '!@#$%^&*';
  
  const allChars = uppercase + lowercase + numbers + specials;
  
  let password = '';
  
  // Asegurar al menos un carácter de cada tipo
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += specials[Math.floor(Math.random() * specials.length)];
  
  // Completar con caracteres aleatorios
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Mezclar los caracteres
  return password.split('').sort(() => Math.random() - 0.5).join('');
}