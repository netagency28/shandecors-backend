import { Router } from 'express';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import getPrismaClient from '../services/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const getSupabaseClient = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
};

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const profileSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(6).optional(),
});

const upsertLocalUser = async (user: { id: string; email?: string; user_metadata?: any }) => {
  if (!user.email) return null;

  const prisma = getPrismaClient();
  const existing = await prisma.user.findUnique({ where: { email: user.email } });

  const role = existing?.role || user.user_metadata?.role || 'CUSTOMER';

  return prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.user_metadata?.name || existing?.name || user.email.split('@')[0],
      role,
      updatedAt: new Date(),
    },
    create: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email.split('@')[0],
      role,
    },
  });
};

router.post('/signup', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient();
    const validatedData = signUpSchema.parse(req.body);

    const { data, error } = await supabase.auth.signUp({
      email: validatedData.email,
      password: validatedData.password,
      options: {
        data: {
          name: validatedData.name,
        },
      },
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    if (data.user) {
      await upsertLocalUser(data.user);
    }

    return res.status(201).json({ user: data.user, session: data.session });
  } catch (error) {
    return next(error);
  }
});

router.post('/signin', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient();
    const validatedData = signInSchema.parse(req.body);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: validatedData.email,
      password: validatedData.password,
    });

    if (error || !data.user) {
      return res.status(401).json({ message: error?.message || 'Invalid credentials' });
    }

    const localUser = await upsertLocalUser(data.user);

    return res.json({
      user: {
        ...data.user,
        role: localUser?.role || 'CUSTOMER',
        name: localUser?.name || data.user.user_metadata?.name,
      },
      session: data.session,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
    if (!refreshToken) {
      return res.status(400).json({ message: 'refresh_token is required' });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.user || !data.session) {
      return res.status(401).json({ message: error?.message || 'Failed to refresh session' });
    }

    const localUser = await upsertLocalUser(data.user);

    return res.json({
      user: {
        ...data.user,
        role: localUser?.role || 'CUSTOMER',
        name: localUser?.name || data.user.user_metadata?.name,
      },
      session: data.session,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/signout', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json({ message: 'Signed out successfully' });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({ where: { email: req.user.email } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        is_admin: user.role === 'ADMIN',
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/profile', authMiddleware, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const data = profileSchema.parse(req.body ?? {});
    const prisma = getPrismaClient();

    const updated = await prisma.user.update({
      where: { email: req.user.email },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
    });

    return res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      role: updated.role,
      is_admin: updated.role === 'ADMIN',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
