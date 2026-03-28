"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_js_1 = require("@supabase/supabase-js");
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const getSupabaseClient = () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
    }
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
};
const signUpSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().optional(),
});
const signInSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string(),
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
            await safeUpsertLocalUser(data.user);
        }
        return res.status(201).json({ user: data.user, session: data.session });
    }
    catch (error) {
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
    }
    catch (error) {
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
exports.default = router;
//# sourceMappingURL=auth.js.map