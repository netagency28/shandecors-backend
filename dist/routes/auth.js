"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const auth_service_1 = require("../services/auth-service");
const router = (0, express_1.Router)();
const strictAuthLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const resetPasswordLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password reset requests. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false,
});
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
router.post('/signup', strictAuthLimiter, async (req, res, next) => {
    try {
        const validatedData = signUpSchema.parse(req.body);
        const data = await auth_service_1.authService.signUp(validatedData.email, validatedData.password, validatedData.name);
        if (data.user) {
            await safeUpsertLocalUser(data.user);
        }
        return res.status(201).json({ user: data.user, session: data.session });
    }
    catch (error) {
        return next(error);
    }
});
router.post('/signin', strictAuthLimiter, async (req, res, next) => {
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
        const data = profileSchema.parse(req.body ?? {});
        const prisma = (0, database_1.default)();
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
    }
    catch (error) {
        return next(error);
    }
});
// Reset password
router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
    try {
        const validatedData = resetPasswordSchema.parse(req.body);
        await auth_service_1.authService.resetPasswordForEmail(validatedData.email);
        res.json({ message: 'Password reset link sent successfully' });
    }
    catch (error) {
        console.error('Reset password error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Failed to send reset link' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map