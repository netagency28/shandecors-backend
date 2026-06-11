"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const auth_service_1 = require("../services/auth-service");
const rateLimiters_1 = require("../middleware/rateLimiters");
const router = (0, express_1.Router)();
const signUpSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().optional(),
});
const signInSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string(),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
const profileSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).optional(),
    phone: zod_1.z.string().trim().min(6).optional(),
});
const upsertLocalUser = async (user) => {
    if (!user.email)
        return null;
    const prisma = (0, database_1.default)();
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
const safeUpsertLocalUser = async (user) => {
    try {
        return await upsertLocalUser(user);
    }
    catch (error) {
        console.warn('Skipping local user sync because database is unavailable:', error);
        return null;
    }
};
const buildUserResponse = (user, localUser) => ({
    id: localUser?.id || user.id,
    email: user.email,
    name: localUser?.name || user.user_metadata?.name || null,
    role: localUser?.role || user.user_metadata?.role || 'CUSTOMER',
});
const serializeAuthUser = (user) => {
    if (!user)
        return null;
    return {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || null,
        role: user.user_metadata?.role || 'CUSTOMER',
    };
};
router.post('/signup', rateLimiters_1.authLimiter, async (req, res, next) => {
    try {
        const validatedData = signUpSchema.parse(req.body);
        const data = await auth_service_1.authService.signUp(validatedData.email, validatedData.password, validatedData.name);
        if (data.user) {
            await safeUpsertLocalUser(data.user);
        }
        const response = {
            user: serializeAuthUser(data.user),
            session: data.session,
        };
        if (!data.session) {
            response.message = 'Account created! Please check your email to verify your account.';
        }
        return res.status(201).json(response);
    }
    catch (error) {
        return next(error);
    }
});
router.post('/signin', rateLimiters_1.authLimiter, async (req, res, next) => {
    try {
        const validatedData = signInSchema.parse(req.body);
        const data = await auth_service_1.authService.signIn(validatedData.email, validatedData.password);
        if (!data.user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const localUser = await safeUpsertLocalUser(data.user);
        return res.json({
            user: buildUserResponse(data.user, localUser),
            session: data.session,
        });
    }
    catch (error) {
        return next(error);
    }
});
router.post('/refresh', async (req, res, next) => {
    try {
        const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
        if (!refreshToken) {
            return res.status(400).json({ message: 'refresh_token is required' });
        }
        const supabase = (0, auth_service_1.getSupabaseClient)();
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
    }
    catch (error) {
        return next(error);
    }
});
router.post('/signout', async (req, res, next) => {
    try {
        const supabase = (0, auth_service_1.getSupabaseClient)();
        const { error } = await supabase.auth.signOut();
        if (error) {
            return res.status(400).json({ message: error.message });
        }
        return res.json({ message: 'Signed out successfully' });
    }
    catch (error) {
        return next(error);
    }
});
router.get('/me', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (!req.user?.email) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        let user = null;
        try {
            const prisma = (0, database_1.default)();
            user = await prisma.user.findUnique({ where: { email: req.user.email } });
        }
        catch (dbError) {
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
    }
    catch (error) {
        return next(error);
    }
});
router.post('/profile', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (!req.user?.email) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const parsed = profileSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ message: parsed.error.errors.map((e) => e.message).join('; ') });
        }
        const prisma = (0, database_1.default)();
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
    }
    catch (error) {
        return next(error);
    }
});
router.post('/reset-password', rateLimiters_1.authLimiter, async (req, res, next) => {
    try {
        const validatedData = resetPasswordSchema.parse(req.body);
        await auth_service_1.authService.resetPasswordForEmail(validatedData.email);
        return res.json({ message: 'Password reset link sent successfully' });
    }
    catch (error) {
        return next(error);
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map