import { Router } from 'express';
import { z } from 'zod';
import getPrismaClient from '../services/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { authService, getSupabaseClient, getSupabaseAdminClient } from '../services/auth-service';
import {
  clearAuthCookies,
  getAccessTokenFromCookies,
  getRefreshTokenFromCookies,
  setAuthCookies,
} from '../services/auth-cookies';
import { authLimiter } from '../middleware/rateLimiters';

const router = Router();

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

const updatePasswordSchema = z.object({
  password: z.string().min(8),
});

const sessionExchangeSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
});

const upsertLocalUser = async (user: { id: string; email?: string; user_metadata?: { name?: string } }) => {
  if (!user.email) return null;

  const prisma = getPrismaClient();
  const existing = await prisma.user.findUnique({ where: { email: user.email } });

  if (existing) {
    return prisma.user.update({
      where: { email: user.email },
      data: {
        name: user.user_metadata?.name || existing.name || user.email.split('@')[0],
        updatedAt: new Date(),
      },
    });
  }

  return prisma.user.create({
    data: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email.split('@')[0],
      role: 'CUSTOMER',
    },
  });
};

const safeUpsertLocalUser = async (user: { id: string; email?: string; user_metadata?: { name?: string } }) => {
  try {
    return await upsertLocalUser(user);
  } catch (error) {
    console.warn('Skipping local user sync because database is unavailable:', error);
    return null;
  }
};

const buildUserResponse = (
  user: { id: string; email?: string; user_metadata?: { name?: string } },
  localUser: { id: string; email: string; name: string | null; phone: string | null; role: string } | null,
) => ({
  id: localUser?.id || user.id,
  email: user.email,
  name: localUser?.name || user.user_metadata?.name || null,
  role: localUser?.role || 'CUSTOMER',
});

const serializeAuthUser = (
  user: { id: string; email?: string; user_metadata?: { name?: string } } | null,
  localUser: { role: string; name: string | null } | null,
) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: localUser?.name || user.user_metadata?.name || null,
    role: localUser?.role || 'CUSTOMER',
  };
};

router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const validatedData = signUpSchema.parse(req.body);

    const data = await authService.signUp(
      validatedData.email,
      validatedData.password,
      validatedData.name,
    );

    let localUser = null;
    if (data.user) {
      localUser = await safeUpsertLocalUser(data.user);
    }

    if (data.session) {
      setAuthCookies(res, data.session);
    }

    const response: Record<string, unknown> = {
      user: serializeAuthUser(data.user, localUser),
      authenticated: !!data.session,
    };

    if (!data.session) {
      response.message = 'Account created! Please check your email to verify your account.';
    }

    return res.status(201).json(response);
  } catch (error) {
    return next(error);
  }
});

router.post('/signin', authLimiter, async (req, res, next) => {
  try {
    const validatedData = signInSchema.parse(req.body);

    const data = await authService.signIn(validatedData.email, validatedData.password);

    if (!data.user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!data.session?.access_token) {
      return res.status(401).json({
        message: 'Please verify your email before signing in. Check your inbox for the confirmation link.',
      });
    }

    const localUser = await safeUpsertLocalUser(data.user);
    setAuthCookies(res, data.session);

    return res.json({
      user: buildUserResponse(data.user, localUser),
      authenticated: true,
      profile: localUser
        ? {
            id: localUser.id,
            email: localUser.email,
            name: localUser.name,
            phone: localUser.phone,
            is_admin: localUser.role === 'ADMIN',
          }
        : null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/session', authLimiter, async (req, res, next) => {
  try {
    const parsed = sessionExchangeSchema.parse(req.body);
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token || '',
    });

    if (error || !data.user || !data.session) {
      return res.status(401).json({ message: 'Invalid or expired session' });
    }

    const localUser = await safeUpsertLocalUser(data.user);
    setAuthCookies(res, data.session);

    return res.json({
      user: buildUserResponse(data.user, localUser),
      authenticated: true,
      profile: localUser
        ? {
            id: localUser.id,
            email: localUser.email,
            name: localUser.name,
            phone: localUser.phone,
            is_admin: localUser.role === 'ADMIN',
          }
        : null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const refreshToken =
      getRefreshTokenFromCookies(req.cookies || {}) ||
      (typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '');

    if (!refreshToken) {
      return res.status(400).json({ message: 'refresh_token is required' });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.user || !data.session) {
      clearAuthCookies(res);
      return res.status(401).json({ message: error?.message || 'Failed to refresh session' });
    }

    const localUser = await safeUpsertLocalUser(data.user);
    setAuthCookies(res, data.session);

    return res.json({
      user: buildUserResponse(data.user, localUser),
      authenticated: true,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/signout', async (_req, res, next) => {
  try {
    clearAuthCookies(res);
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    return res.json({ message: 'Signed out successfully' });
  } catch (error) {
    return next(error);
  }
});

router.get('/session', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = getAccessTokenFromCookies(req.cookies || {});
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : cookieToken;

    if (!token) {
      return res.json({ authenticated: false, user: null, profile: null });
    }

    const supabase = getSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user?.email) {
      clearAuthCookies(res);
      return res.json({ authenticated: false, user: null, profile: null });
    }

    const prisma = getPrismaClient();
    const dbUser = await prisma.user.findUnique({ where: { email: user.email } });

    if (!dbUser) {
      return res.json({ authenticated: false, user: null, profile: null });
    }

    return res.json({
      authenticated: true,
      user: buildUserResponse(user, dbUser),
      profile: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        phone: dbUser.phone,
        is_admin: dbUser.role === 'ADMIN',
      },
    });
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
      return res.status(401).json({ message: 'User profile not found' });
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

    const parsed = profileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors.map((e) => e.message).join('; ') });
    }

    const prisma = getPrismaClient();
    const updated = await prisma.user.update({
      where: { email: req.user.email },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
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

router.post('/update-password', authLimiter, authMiddleware, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { password } = updatePasswordSchema.parse(req.body);
    const admin = getSupabaseAdminClient();
    if (!admin) {
      return res.status(503).json({ message: 'Password update is not configured' });
    }

    const prisma = getPrismaClient();
    const dbUser = await prisma.user.findUnique({ where: { email: req.user.email } });
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { error } = await admin.auth.admin.updateUserById(dbUser.id, { password });

    if (error) {
      return res.status(400).json({ message: error.message || 'Failed to update password' });
    }

    clearAuthCookies(res);
    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);

    await authService.resetPasswordForEmail(validatedData.email);

    return res.json({ message: 'Password reset link sent successfully' });
  } catch (error) {
    return next(error);
  }
});

export default router;
