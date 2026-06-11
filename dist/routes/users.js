"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const rateLimiters_1 = require("../middleware/rateLimiters");
const router = (0, express_1.Router)();
const updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100).optional(),
    phone: zod_1.z.string().trim().min(6).max(20).optional(),
});
router.get('/profile', rateLimiters_1.userLimiter, auth_1.authMiddleware, async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json(user);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
router.put('/profile', auth_1.authMiddleware, async (req, res) => {
    try {
        const data = updateProfileSchema.parse(req.body);
        const prisma = (0, database_1.default)();
        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data,
            select: { id: true, email: true, name: true, phone: true, role: true },
        });
        return res.json(updated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map