"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const Sentry = __importStar(require("@sentry/node"));
const database_1 = __importDefault(require("../services/database"));
const email_1 = require("../services/email");
const rateLimiters_1 = require("../middleware/rateLimiters");
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
router.post('/create-order', rateLimiters_1.checkoutLimiter, async (req, res) => {
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
const logWebhookFailure = (orderId, paymentId, reason) => {
    console.error(`[Webhook] FAILURE timestamp=${new Date().toISOString()} order_id=${orderId} payment_id=${paymentId} failure_reason=${reason}`);
    // TODO: increment cashfree_payment_failure_total{failure_reason} Prometheus counter (Task 11)
};
router.post('/webhook', rateLimiters_1.webhookLimiter, async (req, res) => {
    // These are populated as we parse the payload so Sentry catch block has context
    let orderId = 'unknown';
    let paymentId = 'unknown';
    let userId;
    try {
        // ── 1. SIGNATURE VERIFICATION ──────────────────────────────────────────────
        const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('[Webhook] CASHFREE_WEBHOOK_SECRET not configured — cannot verify signature');
            // Return 200 so Cashfree does not retry; alert must be resolved out-of-band
            return res.status(200).json({ ok: true });
        }
        const signature = req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];
        if (!signature || !timestamp) {
            return res.status(401).json({
                error: 'INVALID_SIGNATURE',
                message: 'Webhook signature verification failed',
            });
        }
        // express.raw() delivers req.body as Buffer; fall back gracefully if not
        const rawBodyBuf = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
        const rawBodyStr = rawBodyBuf.toString('utf8');
        const expectedSig = crypto_1.default
            .createHmac('sha256', webhookSecret)
            .update(`${timestamp}${rawBodyStr}`)
            .digest('base64');
        if (expectedSig !== signature) {
            console.warn('[Webhook] Invalid signature — possible replay or spoofing attempt');
            return res.status(401).json({
                error: 'INVALID_SIGNATURE',
                message: 'Webhook signature verification failed',
            });
        }
        // ── 2. PARSE PAYLOAD ───────────────────────────────────────────────────────
        let payload;
        try {
            payload = JSON.parse(rawBodyStr);
        }
        catch {
            console.warn('[Webhook] Malformed JSON body after valid signature');
            return res.status(200).json({ ok: true });
        }
        const eventType = String(payload?.type || '');
        paymentId = String(payload?.data?.payment?.cf_payment_id || '');
        const orderNumber = String(payload?.data?.order?.order_id || '');
        // Cashfree sends amount in the same unit (Rupees) as we created the order
        const webhookAmount = Number(payload?.data?.order?.order_amount ?? payload?.data?.payment?.payment_amount ?? 0);
        if (!orderNumber) {
            console.warn('[Webhook] Missing order_id in payload');
            return res.status(200).json({ ok: true });
        }
        orderId = orderNumber;
        const prisma = (0, database_1.default)();
        // orderNumber is what we pass to Cashfree (SD-xxx), not the internal UUID
        const order = await prisma.order.findFirst({
            where: { orderNumber },
            include: { user: true },
        });
        if (!order) {
            console.warn(`[Webhook] Order not found for orderNumber: ${orderNumber}`);
            return res.status(200).json({ ok: true });
        }
        orderId = order.id;
        userId = order.userId ?? undefined;
        // ── 3. AMOUNT VALIDATION ───────────────────────────────────────────────────
        const orderTotal = Number(order.total);
        if (webhookAmount > 0 && Math.abs(webhookAmount - orderTotal) > 0.01) {
            const mismatchMsg = `Amount mismatch: expected ₹${orderTotal}, received ₹${webhookAmount}`;
            console.error(`[Webhook] ${mismatchMsg} order_id=${orderId} payment_id=${paymentId}`);
            Sentry.captureMessage(mismatchMsg, {
                level: 'error',
                tags: { order_id: orderId, payment_id: paymentId },
                extra: { expected: orderTotal, received: webhookAmount },
            });
            logWebhookFailure(orderId, paymentId, 'amount_mismatch');
            return res.status(400).json({ error: 'AMOUNT_MISMATCH' });
        }
        // ── 4. PROCESS EVENT ───────────────────────────────────────────────────────
        if (eventType === 'PAYMENT_SUCCESS') {
            // Idempotency check + update inside a transaction to prevent duplicate processing
            const { alreadyProcessed } = await prisma.$transaction(async (tx) => {
                const fresh = await tx.order.findFirst({
                    where: { orderNumber },
                    select: { id: true, paymentStatus: true },
                });
                if (!fresh || fresh.paymentStatus === 'COMPLETED') {
                    return { alreadyProcessed: true };
                }
                await tx.order.update({
                    where: { id: fresh.id },
                    data: {
                        paymentStatus: 'COMPLETED',
                        status: 'CONFIRMED',
                        paymentId: paymentId || order.paymentId,
                    },
                });
                return { alreadyProcessed: false };
            });
            if (alreadyProcessed) {
                console.warn(`[Webhook] Already processed — skipping: order_id=${orderId}`);
                return res.status(200).json({ ok: true, message: 'Already processed' });
            }
            // Post-payment actions
            try {
                const shipping = getShippingAddress(order.shippingAddress);
                const email = getString(order.user?.email) || getString(shipping.email);
                if (email) {
                    await (0, email_1.sendOrderStatusEmail)({
                        orderNumber: order.orderNumber,
                        orderId: order.id,
                        customerName: getString(order.user?.name) || getString(shipping.full_name) || 'Customer',
                        customerEmail: email,
                        total: order.total,
                        newStatus: 'confirmed',
                    });
                }
            }
            catch (emailErr) {
                console.error('[Webhook] Order confirmation email failed (non-fatal):', emailErr);
            }
            // TODO: increment cashfree_payment_success_total Prometheus counter (Task 11)
            console.info(`[Webhook] SUCCESS timestamp=${new Date().toISOString()} order_id=${orderId} payment_id=${paymentId}`);
        }
        else if (eventType === 'PAYMENT_FAILED' || eventType === 'PAYMENT_USER_DROPPED') {
            await prisma.order.update({
                where: { id: order.id },
                data: { paymentStatus: 'FAILED' },
            });
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
                console.error('[Webhook] Payment failure email error (non-fatal):', emailErr);
            }
            logWebhookFailure(orderId, paymentId, eventType.toLowerCase());
            // TODO: increment cashfree_payment_failure_total Prometheus counter (Task 11)
        }
        return res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error('[Webhook] Uncaught error:', error);
        Sentry.captureException(error, {
            tags: { order_id: orderId, payment_id: paymentId },
            extra: { userId },
        });
        // Always return 200 so Cashfree does not retry
        return res.status(200).json({ ok: true });
    }
});
exports.default = router;
//# sourceMappingURL=payments.js.map