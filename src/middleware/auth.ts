import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import getPrismaClient from '../services/database';

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

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No authorization token provided' });
    }

    const token = authHeader.substring(7);
    const supabase = getSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user || !user.email) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    let dbUser: {
      id: string;
      email: string;
      name: string | null;
      role: string;
    } | null = null;

    try {
      const prisma = getPrismaClient();
      dbUser = await prisma.user.findUnique({ where: { email: user.email } });
    } catch (dbError) {
      console.warn('Auth middleware could not load local user profile:', dbError);
    }

    req.user = {
      id: dbUser?.id || user.id,
      email: user.email,
      name: dbUser?.name || user.user_metadata?.name || null,
      role: dbUser?.role || user.user_metadata?.role || 'CUSTOMER',
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

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
