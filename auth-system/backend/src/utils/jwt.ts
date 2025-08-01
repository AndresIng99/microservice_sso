import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-super-secret-key-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface TokenPayload {
  user: {
    id: number;
    username: string;
    email: string;
    permissions: string[];
  };
  type: 'access' | 'refresh';
}

// Generar access token
export function generateAccessToken(user: any): string {
  const payload: TokenPayload = {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      permissions: user.permissions || []
    },
    type: 'access'
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

// Generar refresh token
export function generateRefreshToken(user: any): string {
  const payload: TokenPayload = {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      permissions: user.permissions || []
    },
    type: 'refresh'
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN
  });
}

// Verificar token
export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Token inválido o expirado');
  }
}

// Decodificar token sin verificar (para debug)
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch (error) {
    return null;
  }
}

// Obtener tiempo de expiración de un token
export function getTokenExpiration(token: string): Date | null {
  try {
    const decoded = jwt.decode(token) as any;
    if (decoded && decoded.exp) {
      return new Date(decoded.exp * 1000);
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Verificar si un token está próximo a expirar
export function isTokenExpiringSoon(token: string, minutesThreshold: number = 5): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) return true;
  
  const now = new Date();
  const timeDiff = expiration.getTime() - now.getTime();
  const minutesLeft = timeDiff / (1000 * 60);
  
  return minutesLeft <= minutesThreshold;
}