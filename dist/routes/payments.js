"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const database_1 = __importDefault(require("../services/database"));
const email_1 = require("../services/email");
const router = (0, express_1.Router)();
const getShippingAddress = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    const address = value;
    return {
        email: typeof address.email === 'string' ? address.email : undefined,
        phone: typeof address.phone === 'string' ? address.phone : undefined,
        full_name: typeof address.full_name === 'string' ? address.full_name : undefined,
    };
};
const getString = (value) => (typeof value === 'string' ? value : '');
const cleanEnv = (value) => String(value || '').split('#')[0].trim();
const getCashfreeConfig = () => {
    const clientId = cleanEnv(process.env.CASHFREE_CLIENT_ID);
    const clientSecret = cleanEnv(process.env.CASHFREE_CLIENT_SECRET);
    const environment = cleanEnv(process.env.CASHFREE_ENVIRONMENT || 'sandbox').toLowerCase();
    const apiVersion = cleanEnv(process.env.CASHFREE_API_VERSION || '2023-08-01') || '2023-08-01';
    if (!clientId || !clientSecret) {
        return {
            ok: false,
            message: 'Cashfree is not configured. Missing CASHFREE_CLIENT_ID or CASHFREE_CLIENT_SECRET.',
        };
    }
    const baseUrl = environment === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';
    return { ok: true, clientId, clientSecret, environment, apiVersion, baseUrl };
};
const markOrderConfirmedAndNotify = async (order, oldStatus) => {
    const shipping = getShippingAddress(order.shippingAddress);
    const customerEmail = getString(order.user?.email) || getString(shipping.email);
    if (!customerEmail)
        return;
    await (0, email_1.sendOrderStatusEmail)({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: getString(order.user?.name) || getString(shipping.full_name) || 'Customer',
        customerEmail,
        total: Number(order.total || 0),
        oldStatus,
        newStatus: 'confirmed',
    });
};
router.post('/create-order', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const orderId = req.body?.order_id;
        const customerEmail = req.body?.customer_email;
        const customerPhone = req.body?.customer_phone;
        const customerName = req.body?.customer_name;
        if (!orderId)
            return res.status(400).json({ message: 'order_id is required' });
        const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
        if (!order)
            return res.status(404).json({ message: 'Order not found' });
        const config = getCashfreeConfig();
        if (!config.ok) {
            return res.status(500).json({
                message: config.message,
                required_env: ['CASHFREE_CLIENT_ID', 'CASHFREE_CLIENT_SECRET', 'CASHFREE_ENVIRONMENT'],
            });
        }
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`;
        const shippingAddress = getShippingAddress(order.shippingAddress);
        const rawPhone = customerPhone || shippingAddress.phone || '';
        const resolvedEmail = customerEmail || order.user?.email || shippingAddress.email || '';
        if (!rawPhone) {
            return res.status(400).json({ message: 'customer_phone is required to create a payment order' });
        }
        if (!resolvedEmail) {
            return res.status(400).json({ message: 'customer_email is required to create a payment order' });
        }
        // Cashfree requires exactly 10 digits — strip country code, spaces, and symbols
        const digitsOnly = rawPhone.replace(/\D/g, '');
        const resolvedPhone = digitsOnly.length === 12 && digitsOnly.startsWith('91')
            ? digitsOnly.slice(2)
            : digitsOnly.length === 11 && digitsOnly.startsWith('0')
                ? digitsOnly.slice(1)
                : digitsOnly;
        if (resolvedPhone.length !== 10) {
            return res.status(400).json({ message: `Invalid phone number: must be 10 digits (got "${rawPhone}")` });
        }
        const orderAmount = Math.round(Number(order.total) * 100) / 100;
        const payload = {
            order_id: order.orderNumber,
            order_amount: orderAmount,
            order_currency: order.currency || 'INR',
            customer_details: {
                customer_id: order.userId || `guest_${order.id.slice(0, 8)}`,
                customer_email: resolvedEmail,
                customer_phone: resolvedPhone,
                customer_name: customerName || order.user?.name || shippingAddress.full_name || 'Customer',
            },
            order_meta: {
                return_url: `${frontendUrl}/payment/success?order_id=${order.id}&gateway=cashfree`,
                notify_url: `${backendUrl}/api/payments/webhook`,
            },
        };
        console.info('Cashfree create-order payload:', JSON.stringify({ ...payload, customer_details: { ...payload.customer_details } }));
        const cfResponse = await fetch(`${config.baseUrl}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': config.clientId,
                'x-client-secret': config.clientSecret,
                'x-api-version': config.apiVersion,
            },
            body: JSON.stringify(payload),
        });
        const cfJson = (await cfResponse.json().catch(() => ({})));
        if (!cfResponse.ok) {
            console.error('Cashfree create-order error:', JSON.stringify(cfJson));
            return res.status(400).json({ message: 'Failed to create Cashfree payment order', cashfree_error: cfJson });
        }
        await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PROCESSING', paymentMethod: 'cashfree' },
        });
        return res.json({
            gateway: 'cashfree',
            payment_session_id: typeof cfJson.payment_session_id === 'string' ? cfJson.payment_session_id : null,
            cashfree_order_id: typeof cfJson.order_id === 'string' ? cfJson.order_id : null,
            cf_order_id: typeof cfJson.cf_order_id === 'string' ? cfJson.cf_order_id : null,
            environment: config.environment,
            status: 'processing',
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create payment order' });
    }
});
router.get('/verify/:orderId', async (req, res) => {
    try {
        const prisma = (0, database_1.default)();
        const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: { user: true } });
        if (!order)
            return res.status(404).json({ message: 'Order not found' });
        const config = getCashfreeConfig();
        if (!config.ok) {
            return res.status(500).json({
                message: config.message,
                required_env: ['CASHFREE_CLIENT_ID', 'CASHFREE_CLIENT_SECRET', 'CASHFREE_ENVIRONMENT'],
            });
        }
        const cfResponse = await fetch(`${config.baseUrl}/orders/${order.orderNumber}/payments`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': config.clientId,
                'x-client-secret': config.clientSecret,
                'x-api-version': config.apiVersion,
            },
        });
        const payments = await cfResponse.json().catch(() => ([]));
        if (!cfResponse.ok) {
            return res.status(400).json({ message: 'Failed to verify payment from Cashfree', cashfree_error: payments });
        }
        const latestPayment = Array.isArray(payments) && payments.length > 0 ? payments[0] : null;
        const cfPaymentStatus = latestPayment?.payment_status;
        let paymentStatus = 'pending';
        let orderStatus = String(order.status).toLowerCase();
        if (cfPaymentStatus === 'SUCCESS') {
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    paymentStatus: 'COMPLETED',
                    paymentId: latestPayment?.cf_payment_id || order.paymentId || null,
                    status: order.status === 'PENDING' ? 'CONFIRMED' : order.status,
                },
            });
            paymentStatus = 'paid';
            orderStatus = order.status === 'PENDING' ? 'confirmed' : String(order.status).toLowerCase();
            if (order.status === 'PENDING') {
                await markOrderConfirmedAndNotify(order, 'pending');
            }
        }
        else if (cfPaymentStatus === 'FAILED') {
            await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } });
            paymentStatus = 'failed';
            try {
                const shipping = getShippingAddress(order.shippingAddress);
                const failEmail = getString(order.user?.email) || getString(shipping.email);
                if (failEmail) {
                    const failureReason = getString(latestPayment?.payment_message) ||
                        getString(latestPayment?.error_details?.error_description) ||
                        undefined;
                    await (0, email_1.sendPaymentFailedEmail)({
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        customerName: getString(order.user?.name) || getString(shipping.full_name) || 'Customer',
                        customerEmail: failEmail,
                        total: Number(order.total || 0),
                        failureReason,
                    });
                }
            }
            catch (emailErr) {
                console.error('Payment failed email error (non-fatal):', emailErr);
            }
        }
        return res.json({
            gateway: 'cashfree',
            order_id: order.id,
            payment_status: paymentStatus,
            order_status: orderStatus,
            payment_details: latestPayment,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to verify payment' });
    }
});
router.post('/webhook', async (req, res) => {
    try {
        const clientSecret = cleanEnv(process.env.CASHFREE_CLIENT_SECRET);
        if (!clientSecret) {
            console.error('Webhook received but CASHFREE_CLIENT_SECRET is not set');
            return res.status(500).json({ error: 'Gateway not configured' });
        }
        const rawSignature = req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];
        if (!rawSignature || !timestamp) {
            return res.status(400).json({ error: 'Missing webhook signature headers' });
        }
        const body = JSON.stringify(req.body);
        const expectedSignature = crypto_1.default
            .createHmac('sha256', clientSecret)
            .update(`${timestamp}${body}`)
            .digest('base64');
        if (expectedSignature !== rawSignature) {
            console.warn('Invalid webhook signature — possible replay or spoofing attempt');
            return res.status(400).json({ error: 'Invalid signature' });
        }
        const payload = req.body;
        const eventType = payload?.type || '';
        const cfPaymentId = String(payload?.data?.payment?.cf_payment_id || '');
        const orderId = String(payload?.data?.order?.order_id || '');
        if (!orderId)
            return res.status(400).json({ error: 'Missing order_id in payload' });
        const prisma = (0, database_1.default)();
        const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
        if (!order) {
            console.warn(`Webhook received for unknown order: ${orderId}`);
            return res.status(200).json({ ok: true });
        }
        if (order.paymentStatus === 'COMPLETED') {
            return res.status(200).json({ ok: true, message: 'Already processed' });
        }
        if (eventType === 'PAYMENT_SUCCESS') {
            await prisma.order.update({
                where: { id: orderId },
                data: { paymentStatus: 'COMPLETED', status: 'CONFIRMED', paymentId: cfPaymentId || order.paymentId },
            });
            try {
                const shippingAddress = getShippingAddress(order.shippingAddress);
                const email = shippingAddress.email;
                if (email) {
                    await (0, email_1.sendOrderStatusEmail)({
                        orderNumber: order.orderNumber,
                        orderId: order.id,
                        customerName: shippingAddress.full_name || '',
                        customerEmail: email,
                        total: order.total,
                        newStatus: 'confirmed',
                    });
                }
            }
            catch (emailErr) {
                console.error('Order confirmation email failed (non-fatal):', emailErr);
            }
        }
        else if (eventType === 'PAYMENT_FAILED' || eventType === 'PAYMENT_USER_DROPPED') {
            await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'FAILED' } });
            try {
                const shipping = getShippingAddress(order.shippingAddress);
                const failEmail = getString(order.user?.email) || getString(shipping.email);
                if (failEmail) {
                    const failureReason = getString(payload?.data?.payment?.payment_message) ||
                        getString(payload?.data?.payment?.error_details?.error_description) ||
                        undefined;
                    await (0, email_1.sendPaymentFailedEmail)({
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        customerName: getString(order.user?.name) || getString(shipping.full_name) || 'Customer',
                        customerEmail: failEmail,
                        total: Number(order.total || 0),
                        failureReason,
                    });
                }
            }
            catch (emailErr) {
                console.error('Payment failed email error (non-fatal):', emailErr);
            }
        }
        return res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=payments.js.map