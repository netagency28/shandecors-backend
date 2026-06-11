"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.getSupabaseAdminClient = exports.getSupabaseClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const auth_mock_1 = require("../mocks/auth-mock");
const email_service_1 = require("./email-service");
const email_1 = require("./email");
const errorHandler_1 = require("../middleware/errorHandler");
const USE_MOCK_AUTH = process.env.USE_MOCK_AUTH === 'true' || !process.env.SUPABASE_URL?.includes('supabase.co');
const supabaseFetch = (input, init) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 12000);
    return fetch(input, { ...init, signal: controller.signal })
        .finally(() => clearTimeout(id));
};
const getSupabaseClient = () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
    }
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
        global: { fetch: supabaseFetch },
    });
};
exports.getSupabaseClient = getSupabaseClient;
const getSupabaseAdminClient = () => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!process.env.SUPABASE_URL || !serviceRoleKey)
        return null;
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: supabaseFetch },
    });
};
exports.getSupabaseAdminClient = getSupabaseAdminClient;
const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';
const isOperationalHttpError = (err) => typeof err === 'object' &&
    err !== null &&
    typeof err.statusCode === 'number';
/** Only true for outages / DNS / connection issues — not wrong password. */
const isSupabaseTransportFailure = (error) => {
    if (!error || typeof error !== 'object')
        return false;
    const err = error;
    if (err.status === 0)
        return true;
    if (typeof err.message === 'string' && err.message.toLowerCase().includes('fetch failed'))
        return true;
    const cause = err.cause;
    if (cause && typeof cause === 'object') {
        const code = cause.code;
        if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT')
            return true;
    }
    return false;
};
const mapSupabaseSignInError = (error) => {
    if (error.code === 'invalid_credentials') {
        return (0, errorHandler_1.createError)('Invalid email or password', 401);
    }
    if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
        return (0, errorHandler_1.createError)(error.message || 'Could not sign in', error.status === 429 ? 429 : 400);
    }
    return (0, errorHandler_1.createError)(error.message || 'Could not sign in', 500);
};
const sanitizeMsg = (msg, fallback) => msg && msg !== '{}' ? msg : fallback;
const logSupabaseAuthError = (action, error) => {
    console.error(`Supabase ${action} error:`, {
        message: error.message,
        status: error.status,
        code: error.code,
    });
};
const mapSupabaseSignUpError = (error) => {
    logSupabaseAuthError('signUp', error);
    if (error.code === 'user_already_exists' || error.code === 'email_exists') {
        return (0, errorHandler_1.createError)('An account with this email already exists', 409);
    }
    if (error.code === 'over_email_send_rate_limit') {
        return (0, errorHandler_1.createError)('Too many sign-up attempts. Please wait a few minutes and try again.', 429);
    }
    if (error.code === 'weak_password') {
        return (0, errorHandler_1.createError)('Password is too weak. Use at least 6 characters.', 400);
    }
    if (error.code === 'email_address_invalid') {
        return (0, errorHandler_1.createError)('Please enter a valid email address', 400);
    }
    if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
        const status = error.status === 429 ? 429 : 400;
        return (0, errorHandler_1.createError)(sanitizeMsg(error.message, 'Could not create account'), status);
    }
    return (0, errorHandler_1.createError)(sanitizeMsg(error.message, 'Could not create account. Please try again.'), 500);
};
exports.authService = {
    async signIn(email, password) {
        if (USE_MOCK_AUTH) {
            return await auth_mock_1.mockAuth.signIn(email, password);
        }
        try {
            const supabase = (0, exports.getSupabaseClient)();
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                throw mapSupabaseSignInError(error);
            }
            return data;
        }
        catch (error) {
            if (isOperationalHttpError(error))
                throw error;
            if (isSupabaseTransportFailure(error)) {
                console.warn('Supabase auth unreachable, falling back to mock:', error);
                return await auth_mock_1.mockAuth.signIn(email, password);
            }
            throw error;
        }
    },
    async signUp(email, password, name) {
        if (USE_MOCK_AUTH) {
            return await auth_mock_1.mockAuth.signUp(email, password, name);
        }
        try {
            const admin = (0, exports.getSupabaseAdminClient)();
            const frontendUrl = getFrontendUrl();
            if (!admin) {
                throw (0, errorHandler_1.createError)('Sign up is temporarily unavailable. Please contact support.', 503);
            }
            // Create unconfirmed user and generate confirmation link via admin API.
            // Email is delivered through Resend (same provider as order emails).
            const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
                type: 'signup',
                email,
                password,
                options: {
                    redirectTo: `${frontendUrl}/auth/callback`,
                    data: { name },
                },
            });
            if (linkError) {
                throw mapSupabaseSignUpError(linkError);
            }
            const confirmUrl = linkData?.properties?.action_link;
            if (!confirmUrl) {
                throw (0, errorHandler_1.createError)('Could not generate email confirmation link. Please try again.', 500);
            }
            await (0, email_1.sendSignupConfirmationEmail)(email, name, confirmUrl);
            return {
                user: linkData.user,
                session: null,
            };
        }
        catch (error) {
            if (isOperationalHttpError(error))
                throw error;
            if (isSupabaseTransportFailure(error)) {
                console.warn('Supabase auth unreachable, falling back to mock:', error);
                return await auth_mock_1.mockAuth.signUp(email, password, name);
            }
            throw error;
        }
    },
    async resetPasswordForEmail(email) {
        const emailResult = await email_service_1.emailService.sendPasswordResetEmail(email);
        if (!emailResult.success) {
            throw (0, errorHandler_1.createError)(emailResult.error || 'Failed to send reset link', 500);
        }
        return { data: null, error: null };
    },
    async signOut(accessToken) {
        if (USE_MOCK_AUTH) {
            return { error: null };
        }
        try {
            const supabase = (0, exports.getSupabaseClient)();
            const { error } = await supabase.auth.signOut();
            return { error };
        }
        catch (error) {
            console.error('Supabase signout failed:', error);
            return { error: null }; // Don't fail on signout
        }
    }
};
//# sourceMappingURL=auth-service.js.map