"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const email_1 = require("../services/email");
const router = (0, express_1.Router)();
const statusToClient = (status) => status.toLowerCase();
const paymentToClient = (status) => {
    if (status === 'COMPLETED')
        return 'paid';
    if (status === 'FAILED')
        return 'failed';
    if (status === 'REFUNDED')
        return 'refunded';
    return 'pending';
};
const toClientOrder = (order) => ({
    id: order.id,
    order_number: order.orderNumber,
    status: statusToClient(order.status),
    subtotal: order.subtotal,
    shipping_fee: order.shipping,
    tax: order.tax,
    total: order.total,
    payment_method: order.paymentMethod,
    payment_status: paymentToClient(order.paymentStatus),
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
const getOrCreateUser = async (email, name, phone) => {
    const prisma = (0, database_1.default)();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
        return existing;
    return prisma.user.create({
        data: {
            email,
            name: name || email.split('@')[0],
            phone: phone || null,
            role: 'CUSTOMER',
        },
    });
};
const generateOrderNumber = () => `SD-${Date.now().toString().slice(-8)}`;
const getShippingAddress = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
};
const getString = (value) => (typeof value === 'string' ? value : '');
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: 'Unauthorized' });
        const prisma = (0, database_1.default)();
        const orders = await prisma.order.findMany({
            where: { userId: req.user.id },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ orders: orders.map(toClientOrder) });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch orders' });
    }
});
router.get('/:orderId', auth_1.authMiddleware, async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: 'Unauthorized' });
        const prisma = (0, database_1.default)();
        const order = await prisma.order.findFirst({
            where: { id: req.params.orderId, userId: req.user.id },
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
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: 'Unauthorized' });
        const prisma = (0, database_1.default)();
        const body = req.body || {};
        const items = Array.isArray(body.items) ? body.items : [];
        const productIds = items.map((item) => item.product_id).filter(Boolean);
        if (productIds.length) {
            const count = await prisma.product.count({ where: { id: { in: productIds } } });
            if (count !== productIds.length) {
                return res.status(400).json({ message: 'One or more product IDs are invalid' });
            }
        }
        const created = await prisma.order.create({
            data: {
                userId: req.user.id,
                orderNumber: generateOrderNumber(),
                status: 'PENDING',
                subtotal: Number(body.subtotal || 0),
                tax: Number(body.tax || 0),
                shipping: Number(body.shipping_fee || body.shipping || 0),
                total: Number(body.total || 0),
                paymentMethod: 'cashfree',
                paymentStatus: 'PENDING',
                shippingAddress: body.shipping_address || null,
                billingAddress: body.billing_address || body.shipping_address || null,
                notes: body.notes || null,
                items: {
                    create: items.map((item) => ({
                        productId: item.product_id,
                        quantity: Number(item.quantity || 1),
                        price: Number(item.price || 0),
                        productSnapshot: {
                            product_name: item.product_name,
                            product_image: item.product_image,
                        },
                    })),
                },
            },
            include: { items: true, user: true },
        });
        const shipping = getShippingAddress(created.shippingAddress);
        const customerEmail = getString(created.user?.email) || getString(shipping.email);
        if (customerEmail) {
            await (0, email_1.sendOrderPlacedEmail)({
                orderId: created.id,
                orderNumber: created.orderNumber,
                customerName: getString(created.user?.name) || getString(shipping.full_name) || 'Customer',
                customerEmail,
                total: Number(created.total || 0),
                status: String(created.status).toLowerCase(),
            });
        }
        return res.status(201).json(toClientOrder(created));
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create order' });
    }
});
router.post('/guest', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const body = req.body || {};
        const shipping = body.shipping_address || {};
        const email = shipping.email;
        if (!email) {
            return res.status(400).json({ message: 'Guest checkout requires email' });
        }
        const guest = await getOrCreateUser(email, shipping.full_name, shipping.phone);
        const items = Array.isArray(body.items) ? body.items : [];
        const productIds = items.map((item) => item.product_id).filter(Boolean);
        if (productIds.length) {
            const count = await prisma.product.count({ where: { id: { in: productIds } } });
            if (count !== productIds.length) {
                return res.status(400).json({ message: 'One or more product IDs are invalid' });
            }
        }
        const created = await prisma.order.create({
            data: {
                userId: guest.id,
                orderNumber: generateOrderNumber(),
                status: 'PENDING',
                subtotal: Number(body.subtotal || 0),
                tax: Number(body.tax || 0),
                shipping: Number(body.shipping_fee || body.shipping || 0),
                total: Number(body.total || 0),
                paymentMethod: 'cashfree',
                paymentStatus: 'PENDING',
                shippingAddress: shipping,
                billingAddress: body.billing_address || shipping,
                notes: body.notes || null,
                items: {
                    create: items.map((item) => ({
                        productId: item.product_id,
                        quantity: Number(item.quantity || 1),
                        price: Number(item.price || 0),
                        productSnapshot: {
                            product_name: item.product_name,
                            product_image: item.product_image,
                        },
                    })),
                },
            },
            include: { items: true, user: true },
        });
        const shippingAddress = getShippingAddress(created.shippingAddress);
        const customerEmail = getString(created.user?.email) || getString(shippingAddress.email);
        if (customerEmail) {
            await (0, email_1.sendOrderPlacedEmail)({
                orderId: created.id,
                orderNumber: created.orderNumber,
                customerName: getString(created.user?.name) || getString(shippingAddress.full_name) || 'Customer',
                customerEmail,
                total: Number(created.total || 0),
                status: String(created.status).toLowerCase(),
            });
        }
        return res.status(201).json(toClientOrder(created));
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create guest order' });
    }
});
exports.default = router;
//# sourceMappingURL=orders.js.map