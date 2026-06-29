"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMiddleware = exports.authenticateToken = exports.authMiddleware = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const database_1 = __importDefault(require("../services/database"));
const auth_cookies_1 = require("../services/auth-cookies");
const getSupabaseClient = () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
    }
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
};
const resolveRole = (dbRole) => {
    if (dbRole === 'ADMIN' || dbRole === 'CUSTOMER')
        return dbRole;
    return 'CUSTOMER';
};
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = (0, auth_cookies_1.getAccessTokenFromCookies)(req.cookies || {});
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.substring(7)
            : cookieToken;
        if (!token) {
            return res.status(401).json({ message: 'No authorization token provided' });
        }
        const supabase = getSupabaseClient();
        const { data: { user }, error, } = await supabase.auth.getUser(token);
        if (error || !user || !user.email) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        const prisma = (0, database_1.default)();
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (!dbUser) {
            return res.status(401).json({ message: 'User profile not found' });
        }
        req.user = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name || user.user_metadata?.name || null,
            role: resolveRole(dbUser.role),
        };
        return next();
    }
    catch (error) {
        return res.status(401).json({ message: 'Authentication failed' });
    }
};
exports.authMiddleware = authMiddleware;
// Alias for consistency with existing code
exports.authenticateToken = exports.authMiddleware;
const adminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    return next();
};
exports.adminMiddleware = adminMiddleware;
//# sourceMappingURL=auth.js.map