"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
const addressSchema = zod_1.z.object({
    street: zod_1.z.string().trim().min(1).max(200),
    city: zod_1.z.string().trim().min(1).max(100),
    state: zod_1.z.string().trim().min(1).max(100),
    postalCode: zod_1.z.string().trim().min(4).max(10),
    country: zod_1.z.string().trim().min(1).max(100).default('India'),
    isDefault: zod_1.z.boolean().optional(),
});
const updateAddressSchema = addressSchema.partial();
router.get('/', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const addresses = await prisma.address.findMany({
            where: { userId: req.user.id },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        return res.json(addresses);
    }
    catch {
        return res.status(500).json({ error: 'Failed to fetch addresses' });
    }
});
router.post('/', async (req, res) => {
    try {
        const data = addressSchema.parse(req.body);
        const prisma = (0, database_1.default)();
        const userId = req.user.id;
        if (data.isDefault) {
            await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
        }
        // If this is the first address, make it default
        const count = await prisma.address.count({ where: { userId } });
        const isDefault = data.isDefault ?? count === 0;
        const address = await prisma.address.create({
            data: { ...data, userId, isDefault },
        });
        return res.status(201).json(address);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        return res.status(500).json({ error: 'Failed to create address' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const data = updateAddressSchema.parse(req.body);
        const prisma = (0, database_1.default)();
        const userId = req.user.id;
        const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.userId !== userId) {
            return res.status(404).json({ error: 'Address not found' });
        }
        if (data.isDefault) {
            await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
        }
        const address = await prisma.address.update({
            where: { id: req.params.id },
            data,
        });
        return res.json(address);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        return res.status(500).json({ error: 'Failed to update address' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const userId = req.user.id;
        const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.userId !== userId) {
            return res.status(404).json({ error: 'Address not found' });
        }
        await prisma.address.delete({ where: { id: req.params.id } });
        // If the deleted address was default, promote the most recent remaining address
        if (existing.isDefault) {
            const next = await prisma.address.findFirst({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            });
            if (next) {
                await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
            }
        }
        return res.json({ message: 'Address deleted' });
    }
    catch {
        return res.status(500).json({ error: 'Failed to delete address' });
    }
});
router.put('/:id/default', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const userId = req.user.id;
        const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.userId !== userId) {
            return res.status(404).json({ error: 'Address not found' });
        }
        await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
        const address = await prisma.address.update({
            where: { id: req.params.id },
            data: { isDefault: true },
        });
        return res.json(address);
    }
    catch {
        return res.status(500).json({ error: 'Failed to set default address' });
    }
});
exports.default = router;
//# sourceMappingURL=addresses.js.map