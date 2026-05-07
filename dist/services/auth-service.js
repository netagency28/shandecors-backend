"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.getSupabaseClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const auth_mock_1 = require("../mocks/auth-mock");
const email_service_1 = require("./email-service");
const errorHandler_1 = require("../middleware/errorHandler");
const USE_MOCK_AUTH = process.env.USE_MOCK_AUTH === 'true' || !process.env.SUPABASE_URL?.includes('supabase.co');
const getSupabaseClient = () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
    }
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
};
exports.getSupabaseClient = getSupabaseClient;
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
const mapSupabaseSignUpError = (error) => {
    if (error.code === 'user_already_exists') {
        return (0, errorHandler_1.createError)('An account with this email already exists', 409);
    }
    if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
        return (0, errorHandler_1.createError)(error.message || 'Could not create account', 400);
    }
    return (0, errorHandler_1.createError)(error.message || 'Could not create account', 500);
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
            const supabase = (0, exports.getSupabaseClient)();
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name }
                }
            });
            if (error) {
                throw mapSupabaseSignUpError(error);
            }
            return data;
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
        console.log(`Sending password reset email to: ${email}`);
        const emailResult = await email_service_1.emailService.sendPasswordResetEmail(email);
        if (!emailResult.success) {
            throw new Error(`Failed to send email: ${emailResult.error}`);
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