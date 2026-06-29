"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const contentStore_1 = require("../services/contentStore");
const email_1 = require("../services/email");
const admin_notifications_1 = require("../services/admin-notifications");
const rateLimiters_1 = require("../middleware/rateLimiters");
const order_filters_1 = require("../utils/order-filters");
const router = (0, express_1.Router)();
router.use(rateLimiters_1.adminLimiter, auth_1.authMiddleware, auth_1.adminMiddleware);
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
const toClientOrder = (order) => ({
    id: order.id,
    order_number: order.orderNumber,
    status: String(order.status).toLowerCase(),
    subtotal: order.subtotal,
    shipping_fee: order.shipping,
    tax: order.tax,
    total: order.total,
    payment_method: order.paymentMethod,
    payment_status: order.paymentStatus === 'COMPLETED'
        ? 'paid'
        : order.paymentStatus === 'FAILED'
            ? 'failed'
            : 'pending',
    shipping_address: order.shippingAddress,
    billing_address: order.billingAddress,
    notes: order.notes,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    items: order.items?.map((item) => ({
        id: item.id,
        product_id: item.productId,
        quantity: item.quantity,
        price: item.price,
        ...(item.productSnapshot || {}),
    })) || [],
});
const parseOrderStatus = (status) => {
    if (!status)
        return undefined;
    const normalized = status.toUpperCase();
    const allowed = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
    return allowed.includes(normalized) ? normalized : undefined;
};
const getShippingAddress = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
};
const getString = (value) => (typeof value === 'string' ? value : '');
const buildDailySeries = (orders) => {
    const map = new Map();
    for (let i = 13; i >= 0; i -= 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        map.set(key, 0);
    }
    for (const order of orders) {
        const key = order.createdAt.toISOString().slice(0, 10);
        if (map.has(key))
            map.set(key, (map.get(key) || 0) + Number(order.total || 0));
    }
    return Array.from(map.entries()).map(([date, revenue]) => ({ date, revenue }));
};
const buildWeeklySeries = (orders) => {
    const map = new Map();
    for (let i = 11; i >= 0; i -= 1) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        map.set(key, 0);
    }
    for (const order of orders) {
        const d = new Date(order.createdAt);
        d.setDate(d.getDate() - d.getDay());
        const key = d.toISOString().slice(0, 10);
        if (map.has(key))
            map.set(key, (map.get(key) || 0) + Number(order.total || 0));
    }
    return Array.from(map.entries()).map(([week_start, revenue]) => ({ week_start, revenue }));
};
router.get('/dashboard', async (_req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const paidWhere = {
            paymentStatus: 'COMPLETED',
            ...order_filters_1.excludeCodOrdersWhere,
        };
        const incomingWhere = {
            paymentStatus: { in: ['PENDING', 'PROCESSING'] },
            status: { notIn: ['CANCELLED', 'REFUNDED'] },
            ...order_filters_1.excludeCodOrdersWhere,
        };
        const [totalOrders, totalProducts, activeProducts, totalUsers, revenueAgg, incomingAgg, grouped, recent, paidOrders, lowStockProducts, orderItemGrouped,] = await Promise.all([
            prisma.order.count({ where: order_filters_1.excludeCodOrdersWhere }),
            prisma.product.count(),
            prisma.product.count({ where: { isActive: true } }),
            prisma.user.count(),
            prisma.order.aggregate({ _sum: { total: true }, where: paidWhere }),
            prisma.order.aggregate({ _sum: { total: true }, where: incomingWhere }),
            prisma.order.groupBy({ by: ['status'], _count: { _all: true }, where: order_filters_1.excludeCodOrdersWhere }),
            prisma.order.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                where: order_filters_1.excludeCodOrdersWhere,
                include: { items: true },
            }),
            prisma.order.findMany({ where: paidWhere, select: { createdAt: true, total: true } }),
            prisma.product.findMany({ where: { isActive: true, stock: { lte: 5 }, deletedAt: null }, orderBy: { stock: 'asc' }, take: 8 }),
            prisma.orderItem.groupBy({ by: ['productId'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 5 }),
        ]);
        const topIds = orderItemGrouped.map((x) => x.productId);
        const topProducts = topIds.length
            ? await prisma.product.findMany({ where: { id: { in: topIds } } })
            : [];
        const topProductsMap = new Map(topProducts.map((p) => [p.id, p]));
        const top_selling_products = orderItemGrouped.map((row) => {
            const p = topProductsMap.get(row.productId);
            return {
                product_id: row.productId,
                name: p?.name || 'Unknown Product',
                slug: p?.slug || '',
                images: p?.images || [],
                units_sold: row._sum.quantity || 0,
            };
        });
        const totalRevenue = revenueAgg._sum.total || 0;
        const incomingRevenue = incomingAgg?._sum?.total || 0;
        const paidCount = paidOrders.length;
        const averageOrderValue = paidCount ? totalRevenue / paidCount : 0;
        const orders_by_status = {};
        for (const row of grouped) {
            orders_by_status[String(row.status).toLowerCase()] = row._count._all;
        }
        return res.json({
            total_orders: totalOrders,
            total_revenue: totalRevenue,
            incoming_revenue: incomingRevenue,
            average_order_value: averageOrderValue,
            total_products: totalProducts,
            active_products: activeProducts,
            total_users: totalUsers,
            orders_by_status,
            recent_orders: recent.map(toClientOrder),
            revenue_daily: buildDailySeries(paidOrders),
            revenue_weekly: buildWeeklySeries(paidOrders),
            top_selling_products,
            low_stock_alerts: lowStockProducts.map((p) => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                stock: p.stock,
            })),
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Dashboard fetch failed' });
    }
});
router.get('/products', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const limit = Math.min(Number(req.query.limit) || 100, 200);
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const where = { deletedAt: null };
        if (status === 'active')
            where.isActive = true;
        if (status === 'inactive')
            where.isActive = false;
        const products = await prisma.product.findMany({
            where,
            include: { category: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return res.json({ products: products.map(toClientProduct) });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch admin products' });
    }
});
const productSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(200),
    slug: zod_1.z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
    description: zod_1.z.string().trim().max(5000).nullable().optional(),
    price: zod_1.z.number().nonnegative().max(1000000),
    sale_price: zod_1.z.number().nonnegative().max(1000000).nullable().optional(),
    sku: zod_1.z.string().trim().max(100).optional(),
    stock: zod_1.z.number().int().nonnegative().max(100000),
    images: zod_1.z.array(zod_1.z.string().url().max(500)).max(20).optional(),
    category_id: zod_1.z.string().optional().nullable(),
    is_active: zod_1.z.boolean().optional(),
    is_featured: zod_1.z.boolean().optional(),
    tags: zod_1.z.array(zod_1.z.string().trim().max(50)).max(20).optional(),
});
const productUpdateSchema = productSchema.partial();
router.post('/products', async (req, res) => {
    try {
        const parsed = productSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', details: parsed.error.flatten() });
        }
        const d = parsed.data;
        const prisma = (0, database_1.default)();
        const created = await prisma.product.create({
            data: {
                name: d.name,
                slug: d.slug,
                description: d.description ?? null,
                price: d.price,
                comparePrice: d.sale_price ?? null,
                sku: d.sku || `SKU-${Date.now()}`,
                stock: d.stock,
                images: d.images ?? [],
                categoryId: d.category_id ?? null,
                isActive: d.is_active !== false,
                isFeatured: d.is_featured === true,
                tags: d.tags ?? [],
            },
            include: { category: true },
        });
        return res.status(201).json(toClientProduct(created));
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create product' });
    }
});
router.put('/products/:productId', async (req, res) => {
    try {
        const parsed = productUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', details: parsed.error.flatten() });
        }
        const d = parsed.data;
        const prisma = (0, database_1.default)();
        const updated = await prisma.product.update({
            where: { id: req.params.productId },
            data: {
                ...(d.name !== undefined ? { name: d.name } : {}),
                ...(d.slug !== undefined ? { slug: d.slug } : {}),
                ...(d.description !== undefined ? { description: d.description } : {}),
                ...(d.price !== undefined ? { price: d.price } : {}),
                ...(d.sale_price !== undefined ? { comparePrice: d.sale_price } : {}),
                ...(d.sku !== undefined ? { sku: d.sku } : {}),
                ...(d.stock !== undefined ? { stock: d.stock } : {}),
                ...(d.images !== undefined ? { images: d.images } : {}),
                ...(d.category_id !== undefined ? { categoryId: d.category_id ?? null } : {}),
                ...(d.is_active !== undefined ? { isActive: d.is_active } : {}),
                ...(d.is_featured !== undefined ? { isFeatured: d.is_featured } : {}),
                ...(d.tags !== undefined ? { tags: d.tags } : {}),
            },
            include: { category: true },
        });
        return res.json(toClientProduct(updated));
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update product' });
    }
});
router.delete('/products/:productId', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        await prisma.product.update({
            where: { id: req.params.productId },
            data: { deletedAt: new Date() },
        });
        return res.json({ message: 'Product deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to delete product' });
    }
});
router.post('/products/bulk-delete', async (req, res) => {
    try {
        const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
        const ids = raw.filter((id) => typeof id === 'string' && id.length > 0).slice(0, 100);
        if (!ids.length)
            return res.status(400).json({ message: 'ids is required' });
        const prisma = (0, database_1.default)();
        const result = await prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { deletedAt: new Date() },
        });
        return res.json({ deleted: result.count });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed bulk delete' });
    }
});
router.get('/orders', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const limit = Math.min(Number(req.query.limit) || 100, 200);
        const parsedStatus = parseOrderStatus(typeof req.query.status === 'string' ? req.query.status : undefined);
        const orders = await prisma.order.findMany({
            where: {
                ...order_filters_1.excludeCodOrdersWhere,
                ...(parsedStatus ? { status: parsedStatus } : {}),
            },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return res.json({ orders: orders.map(toClientOrder) });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch admin orders' });
    }
});
router.get('/orders/:orderId', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const order = await prisma.order.findFirst({
            where: {
                id: req.params.orderId,
                ...order_filters_1.excludeCodOrdersWhere,
            },
            include: { items: true },
        });
        if (!order)
            return res.status(404).json({ message: 'Order not found' });
        return res.json(toClientOrder(order));
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch order' });
    }
});
router.put('/orders/:orderId/status', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const nextStatus = parseOrderStatus(req.body?.status);
        if (!nextStatus) {
            return res.status(400).json({ message: 'Invalid status' });
        }
        const existing = await prisma.order.findUnique({
            where: { id: req.params.orderId },
            include: { user: true },
        });
        if (!existing) {
            return res.status(404).json({ message: 'Order not found' });
        }
        const updated = await prisma.order.update({
            where: { id: req.params.orderId },
            data: { status: nextStatus },
            include: { items: true, user: true },
        });
        const shipping = getShippingAddress(updated.shippingAddress);
        const customerEmail = getString(updated.user?.email) || getString(shipping.email);
        if (customerEmail && String(existing.status) !== String(updated.status)) {
            await (0, email_1.sendOrderStatusEmail)({
                orderId: updated.id,
                orderNumber: updated.orderNumber,
                customerName: getString(updated.user?.name) || getString(shipping.full_name) || 'Customer',
                customerEmail,
                total: Number(updated.total || 0),
                oldStatus: String(existing.status).toLowerCase(),
                newStatus: String(updated.status).toLowerCase(),
            });
        }
        return res.json(toClientOrder(updated));
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update order status' });
    }
});
const categorySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100),
    slug: zod_1.z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
    description: zod_1.z.string().trim().max(1000).nullable().optional(),
    image_url: zod_1.z.string().url().max(500).nullable().optional(),
    is_active: zod_1.z.boolean().optional(),
});
router.post('/categories', async (req, res) => {
    try {
        const parsed = categorySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', details: parsed.error.flatten() });
        }
        const { name, slug, description, image_url, is_active } = parsed.data;
        const prisma = (0, database_1.default)();
        const created = await prisma.category.create({
            data: {
                name,
                slug,
                description: description ?? null,
                image: image_url ?? null,
                isActive: is_active !== false,
            },
        });
        return res.status(201).json({
            id: created.id,
            name: created.name,
            slug: created.slug,
            description: created.description,
            image_url: created.image,
            is_active: created.isActive,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create category' });
    }
});
router.delete('/categories/:categoryId', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const { categoryId } = req.params;
        // Block if active (non-deleted) products are still in this category
        const activeCount = await prisma.product.count({ where: { categoryId, deletedAt: null } });
        if (activeCount > 0) {
            return res.status(409).json({
                message: `Cannot delete this category — ${activeCount} active product${activeCount === 1 ? '' : 's'} still assigned to it. Reassign or delete those products first.`,
            });
        }
        // categoryId is NOT NULL on Product, so archived products must be hard-deleted before
        // the category can be removed. Only safe to hard-delete if they have no order history.
        const archivedWithOrders = await prisma.product.count({
            where: { categoryId, deletedAt: { not: null }, orderItems: { some: {} } },
        });
        if (archivedWithOrders > 0) {
            return res.status(409).json({
                message: `Cannot delete this category — ${archivedWithOrders} archived product${archivedWithOrders === 1 ? '' : 's'} still ha${archivedWithOrders === 1 ? 's' : 've'} order history. Contact support to migrate those order references first.`,
            });
        }
        // Hard-delete archived products with no orders (cart items, reviews, wishlists cascade)
        await prisma.product.deleteMany({
            where: { categoryId, deletedAt: { not: null } },
        });
        await prisma.category.delete({ where: { id: categoryId } });
        return res.json({ message: 'Category deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to delete category' });
    }
});
router.get('/users', async (_req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(users);
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch users' });
    }
});
router.put('/users/:id/role', async (req, res) => {
    try {
        const { role } = req.body;
        if (!['CUSTOMER', 'ADMIN'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }
        const prisma = (0, database_1.default)();
        if (role === 'CUSTOMER' && req.user.id === req.params.id) {
            const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot demote the only admin account.' });
            }
        }
        const updatedUser = await prisma.user.update({
            where: { id: req.params.id },
            data: { role },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        });
        return res.json(updatedUser);
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update user role' });
    }
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100).optional(),
    role: zod_1.z.enum(['CUSTOMER', 'ADMIN']).optional(),
});
router.put('/users/:id', async (req, res) => {
    try {
        const parsed = updateUserSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', details: parsed.error.flatten() });
        }
        const prisma = (0, database_1.default)();
        const { id } = req.params;
        const { name, role } = parsed.data;
        // Prevent demoting yourself if you're the only admin
        if (role === 'CUSTOMER' && req.user.id === id) {
            const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot demote the only admin account.' });
            }
        }
        const updated = await prisma.user.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(role !== undefined ? { role } : {}),
            },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        });
        return res.json(updated);
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update user' });
    }
});
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const requestingUserId = req.user.id;
        if (id === requestingUserId) {
            return res.status(400).json({ message: 'You cannot delete your own account.' });
        }
        const prisma = (0, database_1.default)();
        const target = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true, _count: { select: { orders: true } } },
        });
        if (!target) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if ((target._count?.orders ?? 0) > 0) {
            return res.status(400).json({ message: 'Cannot delete a user who has placed orders.' });
        }
        if (target.role === 'ADMIN') {
            const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot delete the only admin account.' });
            }
        }
        await prisma.user.delete({ where: { id } });
        return res.json({ message: 'User deleted successfully.' });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to delete user' });
    }
});
router.get('/content', async (_req, res) => {
    try {
        const content = await (0, contentStore_1.readSiteContent)();
        return res.json(content);
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch content pages' });
    }
});
router.get('/content/:slug', async (req, res) => {
    try {
        const entry = await (0, contentStore_1.readSiteContentEntry)(req.params.slug);
        if (!entry) {
            return res.status(404).json({
                message: 'Content page not found',
                allowed_slugs: contentStore_1.ALLOWED_CONTENT_SLUGS,
            });
        }
        return res.json({
            slug: req.params.slug,
            ...entry,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch content page' });
    }
});
router.put('/content/:slug', async (req, res) => {
    try {
        const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
        const body = typeof req.body?.body === 'string' ? req.body.body : undefined;
        if (title === undefined && body === undefined) {
            return res.status(400).json({ message: 'title or body is required' });
        }
        const updated = await (0, contentStore_1.updateSiteContentEntry)(req.params.slug, { title, body });
        if (!updated) {
            return res.status(404).json({
                message: 'Content page not found',
                allowed_slugs: contentStore_1.ALLOWED_CONTENT_SLUGS,
            });
        }
        return res.json({
            slug: req.params.slug,
            ...updated,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update content page' });
    }
});
const moderateReviewBody = zod_1.z.object({
    moderationStatus: zod_1.z.enum(['APPROVED', 'REJECTED']),
});
const adminReplyBody = zod_1.z.object({
    adminReply: zod_1.z.string().max(2000),
});
router.get('/reviews', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
        const skip = (page - 1) * limit;
        const where = {};
        const mod = typeof req.query.moderationStatus === 'string' ? req.query.moderationStatus : '';
        if (mod === 'PENDING' || mod === 'APPROVED' || mod === 'REJECTED') {
            where.moderationStatus = mod;
        }
        if (req.query.rating) {
            const r = parseInt(String(req.query.rating), 10);
            if (!Number.isNaN(r))
                where.rating = r;
        }
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        if (search) {
            where.OR = [
                { comment: { contains: search, mode: 'insensitive' } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
                { product: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }
        const [reviews, total] = await Promise.all([
            prisma.review.findMany({
                where,
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                    product: {
                        select: { id: true, name: true, slug: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.review.count({ where }),
        ]);
        return res.json({
            reviews,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit) || 1,
            },
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch reviews' });
    }
});
router.put('/reviews/:reviewId/moderate', async (req, res) => {
    try {
        const parsed = moderateReviewBody.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid body', details: parsed.error.flatten() });
        }
        const prisma = (0, database_1.default)();
        const { reviewId } = req.params;
        const { moderationStatus } = parsed.data;
        const updated = await prisma.review.update({
            where: { id: reviewId },
            data: { moderationStatus },
            include: {
                user: { select: { id: true, name: true, email: true } },
                product: { select: { id: true, name: true, slug: true } },
            },
        });
        return res.json(updated);
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update review status' });
    }
});
router.put('/reviews/:reviewId/reply', async (req, res) => {
    try {
        const parsed = adminReplyBody.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid body', details: parsed.error.flatten() });
        }
        const prisma = (0, database_1.default)();
        const { reviewId } = req.params;
        const trimmed = parsed.data.adminReply.trim();
        const updated = await prisma.review.update({
            where: { id: reviewId },
            data: {
                adminReply: trimmed.length > 0 ? trimmed : null,
                adminRepliedAt: trimmed.length > 0 ? new Date() : null,
            },
            include: {
                user: { select: { id: true, name: true, email: true } },
                product: { select: { id: true, name: true, slug: true } },
            },
        });
        return res.json(updated);
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to save reply' });
    }
});
router.post('/notifications/test', async (_req, res) => {
    try {
        const result = await (0, admin_notifications_1.testAdminNotifications)();
        const statusCode = result.email.ok || result.telegram.ok ? 200 : 502;
        return res.status(statusCode).json({
            message: result.telegram.ok
                ? 'Test notification sent — check Telegram and admin email inbox'
                : 'Test completed with errors — see telegram/email fields',
            ...result,
        });
    }
    catch (error) {
        return res.status(500).json({
            message: error instanceof Error ? error.message : 'Failed to send test notification',
        });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map