"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const router = (0, express_1.Router)();
// GET /api/test/db - Test database connection
router.get('/db', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        // Test connection
        await prisma.$connect();
        // Test query
        const userCount = await prisma.user.count();
        res.json({
            success: true,
            data: {
                message: 'Database connection successful',
                userCount,
                timestamp: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: {
                message: error instanceof Error ? error.message : 'Database connection failed',
                timestamp: new Date().toISOString(),
            },
        });
    }
});
exports.default = router;
//# sourceMappingURL=test.js.map