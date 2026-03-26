"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const router = (0, express_1.Router)();
const toClientProduct = (product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price,
    sale_price: product.comparePrice,
    sku: product.sku,
    stock: product.stock,
    images: product.images || [],
    category_id: product.categoryId,
    category: product.category
        ? {
            id: product.category.id,
            name: product.category.name,
            slug: product.category.slug,
        }
        : undefined,
    is_active: product.isActive,
    is_featured: product.isFeatured,
    tags: product.tags || [],
    created_at: product.createdAt,
    updated_at: product.updatedAt,
});
router.get('/', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const page = Math.max(Number(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;
        const featured = req.query.featured === 'true';
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const category = typeof req.query.category === 'string' ? req.query.category : undefined;
        const andFilters = [{ isActive: true }];
        if (featured)
            andFilters.push({ isFeatured: true });
        if (search) {
            andFilters.push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                    { tags: { has: search } },
                ],
            });
        }
        if (category) {
            andFilters.push({
                OR: [{ categoryId: category }, { category: { slug: category } }],
            });
        }
        const where = andFilters.length ? { AND: andFilters } : {};
        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                include: { category: true },
                orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
                skip,
                take: limit,
            }),
            prisma.product.count({ where }),
        ]);
        return res.json({
            products: products.map(toClientProduct),
            total,
            page,
            limit,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch products' });
    }
});
router.get('/id/:id', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: { category: true },
        });
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        return res.json(toClientProduct(product));
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch product' });
    }
});
router.get('/:slug', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const product = await prisma.product.findUnique({
            where: { slug: req.params.slug },
            include: { category: true },
        });
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        return res.json(toClientProduct(product));
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch product' });
    }
});
exports.default = router;
//# sourceMappingURL=products.js.map