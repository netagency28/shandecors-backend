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
        // Categories + products aligned with the former storefront mock (stable slugs / SKUs for reviews, wishlist, cart FKs)
        const showcaseCategories = [
            {
                name: 'Wall Decor',
                slug: 'wall-decor',
                description: 'Beautiful wall decorations and art pieces',
                image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Lighting',
                slug: 'lighting',
                description: 'Modern lighting solutions',
                image: 'https://images.unsplash.com/photo-1513506003789-5e024b9c5b32?auto=format&fit=crop&w=1200&q=80',
            },
            {
                name: 'Furniture',
                slug: 'furniture',
                description: 'Contemporary furniture pieces',
                image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
            },
        ];
        for (const category of showcaseCategories) {
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
        const categoriesAll = await prisma.category.findMany();
        const bySlugAll = new Map(categoriesAll.map((c) => [c.slug, c.id]));
        const showcaseProducts = [
            {
                slug: 'modern-wall-clock',
                name: 'Modern Wall Clock',
                description: 'A sleek contemporary wall clock',
                price: 2999,
                comparePrice: 2499,
                sku: 'WC-001',
                stock: 15,
                categorySlug: 'wall-decor',
                featured: true,
                images: ['https://images.unsplash.com/photo-1608198093002-ad4a00b6b5c5?w=400'],
                tags: ['modern', 'clock', 'wall'],
            },
            {
                slug: 'abstract-wall-art',
                name: 'Abstract Wall Art',
                description: 'Beautiful abstract painting for modern spaces',
                price: 5999,
                comparePrice: null,
                sku: 'WA-002',
                stock: 8,
                categorySlug: 'wall-decor',
                featured: true,
                images: ['https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400'],
                tags: ['abstract', 'art', 'painting'],
            },
            {
                slug: 'minimalist-vase',
                name: 'Minimalist Vase',
                description: 'Simple elegant vase for modern decor',
                price: 1899,
                comparePrice: 1599,
                sku: 'MV-003',
                stock: 20,
                categorySlug: 'accessories',
                featured: false,
                images: ['https://images.unsplash.com/photo-1528629934191-3d609f4c623b?w=400'],
                tags: ['minimalist', 'vase', 'decor'],
            },
            {
                slug: 'decorative-mirror',
                name: 'Decorative Mirror',
                description: 'Elegant mirror with ornate frame',
                price: 8999,
                comparePrice: null,
                sku: 'DM-004',
                stock: 5,
                categorySlug: 'wall-decor',
                featured: true,
                images: ['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400'],
                tags: ['mirror', 'wall', 'elegant'],
            },
        ];
        for (const p of showcaseProducts) {
            const categoryId = bySlugAll.get(p.categorySlug);
            if (!categoryId)
                continue;
            await prisma.product.upsert({
                where: { slug: p.slug },
                create: {
                    name: p.name,
                    slug: p.slug,
                    description: p.description,
                    price: p.price,
                    comparePrice: p.comparePrice,
                    sku: p.sku,
                    stock: p.stock,
                    images: p.images,
                    categoryId,
                    isActive: true,
                    isFeatured: p.featured,
                    tags: p.tags,
                },
                update: {
                    name: p.name,
                    description: p.description,
                    price: p.price,
                    comparePrice: p.comparePrice,
                    sku: p.sku,
                    stock: p.stock,
                    images: p.images,
                    categoryId,
                    isFeatured: p.featured,
                    isActive: true,
                    tags: p.tags,
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