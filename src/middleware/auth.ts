import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import getPrismaClient from '../services/database';
import { getAccessTokenFromCookies } from '../services/auth-cookies';

const getSupabaseClient = (): SupabaseClient => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
};

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    name?: string | null;
  };
}

const resolveRole = (dbRole?: string | null) => {
  if (dbRole === 'ADMIN' || dbRole === 'CUSTOMER') return dbRole;
  return 'CUSTOMER';
};

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = getAccessTokenFromCookies(req.cookies || {});
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : cookieToken;

    if (!token) {
      return res.status(401).json({ message: 'No authorization token provided' });
    }

    const supabase = getSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user || !user.email) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const prisma = getPrismaClient();
    const dbUser = await prisma.user.findUnique({ where: { email: user.email } });

    if (!dbUser) {
      return res.status(401).json({ message: 'User profile not found' });
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name || user.user_metadata?.name || null,
      role: resolveRole(dbUser.role),
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

// Alias for consistency with existing code
export const authenticateToken = authMiddleware;

export const adminMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  return next();
};
