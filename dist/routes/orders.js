"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const rateLimiters_1 = require("../middleware/rateLimiters");
const admin_notifications_1 = require("../services/admin-notifications");
const checkout_token_1 = require("../services/checkout-token");
const order_pricing_1 = require("../services/order-pricing");
const order_filters_1 = require("../utils/order-filters");
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
const createOrderFromRequest = async (params) => {
    const { userId, body, shippingAddress, billingAddress } = params;
    const priced = await (0, order_pricing_1.validateAndPriceOrder)(body.items);
    const prisma = (0, database_1.default)();
    return prisma.order.create({
        data: {
            userId,
            orderNumber: generateOrderNumber(),
            status: 'PENDING',
            subtotal: priced.subtotal,
            tax: priced.tax,
            shipping: priced.shippingFee,
            total: priced.total,
            paymentMethod: 'cashfree',
            paymentStatus: 'PENDING',
            shippingAddress: shippingAddress,
            billingAddress: billingAddress,
            notes: typeof body.notes === 'string' ? body.notes.slice(0, 1000) : null,
            items: {
                create: priced.items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: item.unitPrice,
                    productSnapshot: item.productSnapshot,
                })),
            },
        },
        include: { items: true, user: true },
    });
};
router.get('/', rateLimiters_1.userLimiter, auth_1.authMiddleware, async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: 'Unauthorized' });
        const prisma = (0, database_1.default)();
        const orders = await prisma.order.findMany({
            where: { userId: req.user.id, ...order_filters_1.excludeCodOrdersWhere },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ orders: orders.map(toClientOrder) });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch orders' });
    }
});
router.get('/:orderId', rateLimiters_1.userLimiter, auth_1.authMiddleware, async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: 'Unauthorized' });
        const prisma = (0, database_1.default)();
        const order = await prisma.order.findFirst({
            where: { id: req.params.orderId, userId: req.user.id, ...order_filters_1.excludeCodOrdersWhere },
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
router.post('/', rateLimiters_1.checkoutLimiter, auth_1.authMiddleware, async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: 'Unauthorized' });
        const body = req.body || {};
        const created = await createOrderFromRequest({
            userId: req.user.id,
            body,
            shippingAddress: body.shipping_address || null,
            billingAddress: body.billing_address || body.shipping_address || null,
        });
        (0, admin_notifications_1.notifyAdminOrderEventSafe)((0, admin_notifications_1.buildOrderAdminPayload)(created, 'order_placed'));
        return res.status(201).json({
            ...toClientOrder(created),
            checkout_token: (0, checkout_token_1.createCheckoutToken)(created.id),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create order';
        const statusCode = message.includes('unavailable') || message.includes('stock') || message.includes('Invalid')
            ? 400
            : 500;
        return res.status(statusCode).json({ message });
    }
});
router.post('/guest', rateLimiters_1.checkoutLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const shipping = body.shipping_address || {};
        const email = typeof shipping.email === 'string' ? shipping.email.trim() : '';
        if (!email) {
            return res.status(400).json({ message: 'Guest checkout requires email' });
        }
        const guest = await getOrCreateUser(email, typeof shipping.full_name === 'string' ? shipping.full_name : null, typeof shipping.phone === 'string' ? shipping.phone : null);
        const created = await createOrderFromRequest({
            userId: guest.id,
            body,
            shippingAddress: shipping,
            billingAddress: body.billing_address || shipping,
        });
        (0, admin_notifications_1.notifyAdminOrderEventSafe)((0, admin_notifications_1.buildOrderAdminPayload)(created, 'order_placed'));
        return res.status(201).json({
            ...toClientOrder(created),
            checkout_token: (0, checkout_token_1.createCheckoutToken)(created.id),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create guest order';
        const statusCode = message.includes('unavailable') || message.includes('stock') || message.includes('Invalid')
            ? 400
            : 500;
        return res.status(statusCode).json({ message });
    }
});
exports.default = router;
//# sourceMappingURL=orders.js.map