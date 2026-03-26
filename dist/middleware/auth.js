"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMiddleware = exports.authMiddleware = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const database_1 = __importDefault(require("../services/database"));
const getSupabaseClient = () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
    }
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
};
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No authorization token provided' });
        }
        const token = authHeader.substring(7);
        const supabase = getSupabaseClient();
        const { data: { user }, error, } = await supabase.auth.getUser(token);
        if (error || !user || !user.email) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        const prisma = (0, database_1.default)();
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        req.user = {
            id: dbUser?.id || user.id,
            email: user.email,
            name: dbUser?.name || user.user_metadata?.name || null,
            role: dbUser?.role || user.user_metadata?.role || 'CUSTOMER',
        };
        return next();
    }
    catch (error) {
        return res.status(401).json({ message: 'Authentication failed' });
    }
};
exports.authMiddleware = authMiddleware;
const adminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    return next();
};
exports.adminMiddleware = adminMiddleware;
//# sourceMappingURL=auth.js.map