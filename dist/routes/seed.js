"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const router = (0, express_1.Router)();
const slugify = (value) => value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
router.post('/', async (_req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const categoriesData = [
            {
                name: 'Lamps',
                slug: 'lamps',
                description: 'Table lamps, floor lamps, and accent lighting.',
                image: 'https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Vases',
                slug: 'vases',
                description: 'Decorative vases for modern and classic interiors.',
                image: 'https://images.unsplash.com/photo-1616627457334-8a1d4e1f1849?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Accessories',
                slug: 'accessories',
                description: 'Small decor accents to complete your home styling.',
                image: 'https://images.unsplash.com/photo-1615529162924-f860538846d6?auto=format&fit=crop&w=1200&q=80',
            },
        ];
        for (const category of categoriesData) {
            await prisma.category.upsert({
                where: { slug: category.slug },
                create: { ...category, isActive: true },
                update: {
                    description: category.description,
                    image: category.image,
                    isActive: true,
                },
            });
        }
        const categories = await prisma.category.findMany();
        const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
        const productsData = [
            {
                name: 'Aurora Table Lamp',
                price: 3499,
                sale: 2999,
                category: 'lamps',
                stock: 18,
                featured: true,
                image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Halo Floor Lamp',
                price: 8999,
                sale: 7599,
                category: 'lamps',
                stock: 10,
                featured: true,
                image: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Nordic Ceramic Vase',
                price: 2499,
                sale: 1999,
                category: 'vases',
                stock: 32,
                featured: true,
                image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Pebble Glass Vase',
                price: 1899,
                sale: null,
                category: 'vases',
                stock: 26,
                featured: false,
                image: 'https://images.unsplash.com/photo-1612196808214-b40f4f83f928?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Artisan Wall Mirror',
                price: 6499,
                sale: 5799,
                category: 'accessories',
                stock: 14,
                featured: false,
                image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Textured Throw Cushion',
                price: 1299,
                sale: 999,
                category: 'accessories',
                stock: 48,
                featured: true,
                image: 'https://images.unsplash.com/photo-1616627457572-7c9aa9f4f4d8?auto=format&fit=crop&w=1200&q=80',
            },
        ];
        for (const p of productsData) {
            const categoryId = bySlug.get(p.category);
            if (!categoryId)
                continue;
            const slug = slugify(p.name);
            await prisma.product.upsert({
                where: { slug },
                create: {
                    name: p.name,
                    slug,
                    description: `${p.name} crafted for premium home decor aesthetics.`,
                    price: p.price,
                    comparePrice: p.sale,
                    sku: `SKU-${slug.toUpperCase().replace(/-/g, '').slice(0, 10)}`,
                    stock: p.stock,
                    images: [p.image],
                    categoryId,
                    isActive: true,
                    isFeatured: p.featured,
                    tags: ['home-decor'],
                },
                update: {
                    price: p.price,
                    comparePrice: p.sale,
                    stock: p.stock,
                    images: [p.image],
                    isFeatured: p.featured,
                    isActive: true,
                },
            });
        }
        const [categoriesCount, productsCount] = await Promise.all([
            prisma.category.count(),
            prisma.product.count(),
        ]);
        return res.json({
            message: 'Seed complete',
            categories: categoriesCount,
            products: productsCount,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Seed failed' });
    }
});
exports.default = router;
//# sourceMappingURL=seed.js.map