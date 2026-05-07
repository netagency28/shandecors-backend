import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import getPrismaClient from '../services/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { authService, getSupabaseClient } from '../services/auth-service';

const router = Router();

const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
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

const safeUpsertLocalUser = async (user: { id: string; email?: string; user_metadata?: any }) => {
  try {
    return await upsertLocalUser(user);
  } catch (error) {
    console.warn('Skipping local user sync because database is unavailable:', error);
    return null;
  }
};

const buildUserResponse = (
  user: { id: string; email?: string; user_metadata?: any },
  localUser: { id: string; email: string; name: string | null; phone: string | null; role: string } | null,
) => ({
  id: localUser?.id || user.id,
  email: user.email,
  name: localUser?.name || user.user_metadata?.name || null,
  role: localUser?.role || user.user_metadata?.role || 'CUSTOMER',
});

router.post('/signup', strictAuthLimiter, async (req, res, next) => {
  try {
    const validatedData = signUpSchema.parse(req.body);

    const data = await authService.signUp(
      validatedData.email,
      validatedData.password,
      validatedData.name
    );

    if (data.user) {
      await safeUpsertLocalUser(data.user);
    }

    return res.status(201).json({ user: data.user, session: data.session });
  } catch (error) {
    return next(error);
  }
});

router.post('/signin', strictAuthLimiter, async (req, res, next) => {
  try {
    const validatedData = signInSchema.parse(req.body);

    const data = await authService.signIn(validatedData.email, validatedData.password);

    if (!data.user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const localUser = await safeUpsertLocalUser(data.user);

    return res.json({
      user: buildUserResponse(data.user, localUser),
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

    const localUser = await safeUpsertLocalUser(data.user);

    return res.json({
      user: buildUserResponse(data.user, localUser),
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

    let user:
      | {
          id: string;
          email: string;
          name: string | null;
          phone: string | null;
          role: string;
        }
      | null = null;

    try {
      const prisma = getPrismaClient();
      user = await prisma.user.findUnique({ where: { email: req.user.email } });
    } catch (dbError) {
      console.warn('Could not read local user profile in /auth/me:', dbError);
    }

    if (!user) {
      return res.json({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name || null,
        phone: null,
        role: req.user.role,
        profile: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name || null,
          phone: null,
          is_admin: req.user.role === 'ADMIN',
        },
      });
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

// Reset password
router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);

    await authService.resetPasswordForEmail(validatedData.email);

    res.json({ message: 'Password reset link sent successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to send reset link' });
  }
});

export default router;
