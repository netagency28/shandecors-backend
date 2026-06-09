import { createClient } from '@supabase/supabase-js';
import { mockAuth } from '../mocks/auth-mock';
import { emailService } from './email-service';
import { createError, type AppError } from '../middleware/errorHandler';

const USE_MOCK_AUTH = process.env.USE_MOCK_AUTH === 'true' || !process.env.SUPABASE_URL?.includes('supabase.co');

const supabaseFetch = (input: string | URL, init?: RequestInit) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 12000);
  return fetch(input as URL, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(id));
};

export const getSupabaseClient = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { fetch: supabaseFetch },
  });
};

const getSupabaseAdminClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !serviceRoleKey) return null;
  return createClient(process.env.SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: supabaseFetch },
  });
};

type SupabaseAuthErrShape = {
  message: string;
  status?: number;
  code?: string;
};

const isOperationalHttpError = (err: unknown): err is AppError =>
  typeof err === 'object' &&
  err !== null &&
  typeof (err as AppError).statusCode === 'number';

/** Only true for outages / DNS / connection issues — not wrong password. */
const isSupabaseTransportFailure = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  if (err.status === 0) return true;
  if (typeof err.message === 'string' && err.message.toLowerCase().includes('fetch failed')) return true;
  const cause = err.cause;
  if (cause && typeof cause === 'object') {
    const code = (cause as { code?: string }).code;
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') return true;
  }
  return false;
};

const mapSupabaseSignInError = (error: SupabaseAuthErrShape): AppError => {
  if (error.code === 'invalid_credentials') {
    return createError('Invalid email or password', 401);
  }
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    return createError(error.message || 'Could not sign in', error.status === 429 ? 429 : 400);
  }
  return createError(error.message || 'Could not sign in', 500);
};

const sanitizeMsg = (msg: string | undefined, fallback: string) =>
  msg && msg !== '{}' ? msg : fallback;

const logSupabaseAuthError = (action: string, error: SupabaseAuthErrShape) => {
  console.error(`Supabase ${action} error:`, {
    message: error.message,
    status: error.status,
    code: error.code,
  });
};

const mapSupabaseSignUpError = (error: SupabaseAuthErrShape): AppError => {
  logSupabaseAuthError('signUp', error);

  if (error.code === 'user_already_exists' || error.code === 'email_exists') {
    return createError('An account with this email already exists', 409);
  }
  if (error.code === 'over_email_send_rate_limit') {
    return createError('Too many sign-up attempts. Please wait a few minutes and try again.', 429);
  }
  if (error.code === 'weak_password') {
    return createError('Password is too weak. Use at least 6 characters.', 400);
  }
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    const status = error.status === 429 ? 429 : 400;
    return createError(sanitizeMsg(error.message, 'Could not create account'), status);
  }
  return createError(sanitizeMsg(error.message, 'Could not create account. Please try again.'), 500);
};

export const authService = {
  async signIn(email: string, password: string) {
    if (USE_MOCK_AUTH) {
      return await mockAuth.signIn(email, password);
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        throw mapSupabaseSignInError(error);
      }
      return data;
    } catch (error) {
      if (isOperationalHttpError(error)) throw error;
      if (isSupabaseTransportFailure(error)) {
        console.warn('Supabase auth unreachable, falling back to mock:', error);
        return await mockAuth.signIn(email, password);
      }
      throw error;
    }
  },

  async signUp(email: string, password: string, name?: string) {
    if (USE_MOCK_AUTH) {
      return await mockAuth.signUp(email, password, name);
    }

    try {
      const supabase = getSupabaseClient();
      const admin = getSupabaseAdminClient();

      // Use admin API to auto-confirm email — avoids Supabase's built-in confirmation
      // email flow (separate from Resend used for order emails in this app).
      if (admin) {
        const { data: created, error: createError_ } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });

        if (createError_) {
          throw mapSupabaseSignUpError(createError_);
        }

        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw mapSupabaseSignInError(signInError);
        }

        return {
          user: data.user ?? created.user,
          session: data.session,
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });

      if (error) {
        throw mapSupabaseSignUpError(error);
      }
      return data;
    } catch (error) {
      if (isOperationalHttpError(error)) throw error;
      if (isSupabaseTransportFailure(error)) {
        console.warn('Supabase auth unreachable, falling back to mock:', error);
        return await mockAuth.signUp(email, password, name);
      }
      throw error;
    }
  },

  async resetPasswordForEmail(email: string) {
    console.log(`Sending password reset email to: ${email}`);

    const emailResult = await emailService.sendPasswordResetEmail(email);

    if (!emailResult.success) {
      throw new Error(`Failed to send email: ${emailResult.error}`);
    }

    return { data: null, error: null };
  },

  async signOut(accessToken: string) {
    if (USE_MOCK_AUTH) {
      return { error: null };
    }

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error) {
      console.error('Supabase signout failed:', error);
      return { error: null }; // Don't fail on signout
    }
  }
};
