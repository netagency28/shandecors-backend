import { Router } from 'express';
import getPrismaClient from '../services/database';
import { sendOrderStatusEmail } from '../services/email';

const router = Router();

type ShippingAddressPayload = {
  email?: string;
  phone?: string;
  full_name?: string;
};

type GatewayName = 'cashfree' | 'instamojo';

const getShippingAddress = (value: unknown): ShippingAddressPayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const address = value as Record<string, unknown>;
  return {
    email: typeof address.email === 'string' ? address.email : undefined,
    phone: typeof address.phone === 'string' ? address.phone : undefined,
    full_name: typeof address.full_name === 'string' ? address.full_name : undefined,
  };
};

const getString = (value: unknown) => (typeof value === 'string' ? value : '');
const cleanEnv = (value?: string) => String(value || '').split('#')[0].trim();

const parseBool = (value?: string) => cleanEnv(value).toLowerCase() === 'true';

const resolveGateway = (): GatewayName => {
  const explicit = cleanEnv(process.env.PAYMENT_GATEWAY).toLowerCase();
  const cashfreeEnabled = parseBool(process.env.ENABLE_CASHFREE ?? 'true');
  const instamojoEnabled = parseBool(process.env.ENABLE_INSTAMOJO ?? 'false');

  if (explicit === 'cashfree' || explicit === 'instamojo') return explicit;
  if (instamojoEnabled && !cashfreeEnabled) return 'instamojo';
  return 'cashfree';
};

const getCashfreeConfig = () => {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const environment = cleanEnv(process.env.CASHFREE_ENVIRONMENT || 'sandbox').toLowerCase();
  const apiVersion = cleanEnv(process.env.CASHFREE_API_VERSION || '2023-08-01') || '2023-08-01';
  const enabled = parseBool(process.env.ENABLE_CASHFREE ?? 'true');

  if (!enabled) {
    return { ok: false as const, message: 'Cashfree gateway is disabled via ENABLE_CASHFREE=false.' };
  }

  if (!clientId || !clientSecret) {
    return {
      ok: false as const,
      message: 'Cashfree is not configured. Missing CASHFREE_CLIENT_ID or CASHFREE_CLIENT_SECRET.',
    };
  }

  const baseUrl = environment === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

  return {
    ok: true as const,
    clientId,
    clientSecret,
    environment,
    apiVersion,
    baseUrl,
  };
};

const getInstamojoConfig = () => {
  const clientId = process.env.INSTAMOJO_CLIENT_ID;
  const clientSecret = process.env.INSTAMOJO_CLIENT_SECRET;
  const environment = cleanEnv(process.env.INSTAMOJO_ENVIRONMENT || 'test').toLowerCase();
  const enabled = parseBool(process.env.ENABLE_INSTAMOJO ?? 'false');

  if (!enabled) {
    return { ok: false as const, message: 'Instamojo gateway is disabled via ENABLE_INSTAMOJO=false.' };
  }

  if (!clientId || !clientSecret) {
    return {
      ok: false as const,
      message: 'Instamojo is not configured. Missing INSTAMOJO_CLIENT_ID or INSTAMOJO_CLIENT_SECRET.',
    };
  }

  const defaultTokenUrl = environment === 'live'
    ? 'https://api.instamojo.com/oauth2/token/'
    : 'https://test.instamojo.com/oauth2/token/';
  const defaultApiBaseUrl = environment === 'live'
    ? 'https://api.instamojo.com/v2'
    : 'https://test.instamojo.com/v2';

  const tokenUrl = cleanEnv(process.env.INSTAMOJO_TOKEN_URL) || defaultTokenUrl;
  const apiBaseUrl = cleanEnv(process.env.INSTAMOJO_API_BASE_URL) || defaultApiBaseUrl;
  const tokenUrlFallback = environment === 'test' && tokenUrl !== 'https://api.instamojo.com/oauth2/token/'
    ? 'https://api.instamojo.com/oauth2/token/'
    : undefined;
  const apiBaseUrlFallback = environment === 'test' && apiBaseUrl !== 'https://api.instamojo.com/v2'
    ? 'https://api.instamojo.com/v2'
    : undefined;

  return {
    ok: true as const,
    clientId,
    clientSecret,
    environment,
    tokenUrl,
    apiBaseUrl,
    tokenUrlFallback,
    apiBaseUrlFallback,
  };
};

const getInstamojoAccessToken = async (config: ReturnType<typeof getInstamojoConfig> & { ok: true }) => {
  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', config.clientId);
  form.set('client_secret', config.clientSecret);

  const tokenUrls = [config.tokenUrl, config.tokenUrlFallback].filter(Boolean) as string[];
  let lastError: string | null = null;

  for (const tokenUrl of tokenUrls) {
    try {
      const tokenResp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });

      const tokenJson = (await tokenResp.json().catch(() => ({}))) as Record<string, unknown>;
      if (tokenResp.ok && typeof tokenJson.access_token === 'string') {
        return tokenJson.access_token;
      }

      lastError = `Instamojo token error from ${tokenUrl}: ${JSON.stringify(tokenJson)}`;
    } catch (error) {
      lastError = `Instamojo token endpoint unreachable (${tokenUrl}): ${error instanceof Error ? error.message : 'fetch failed'}`;
    }
  }

  throw new Error(lastError || 'Failed to generate Instamojo access token');
};

const markOrderConfirmedAndNotify = async (order: any, oldStatus: string) => {
  const shipping = getShippingAddress(order.shippingAddress);
  const customerEmail = getString(order.user?.email) || getString(shipping.email);
  if (!customerEmail) return;

  await sendOrderStatusEmail({
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
    const prisma = getPrismaClient();
    const orderId = req.body?.order_id as string | undefined;
    const customerEmail = req.body?.customer_email as string | undefined;
    const customerPhone = req.body?.customer_phone as string | undefined;
    const customerName = req.body?.customer_name as string | undefined;

    if (!orderId) return res.status(400).json({ message: 'order_id is required' });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) return res.status(404).json({ message: 'Order not found' });

    const gateway = resolveGateway();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`;
    const shippingAddress = getShippingAddress(order.shippingAddress);

    if (gateway === 'cashfree') {
      const config = getCashfreeConfig();
      if (!config.ok) {
        return res.status(500).json({
          message: config.message,
          required_env: ['ENABLE_CASHFREE', 'CASHFREE_CLIENT_ID', 'CASHFREE_CLIENT_SECRET', 'CASHFREE_ENVIRONMENT'],
        });
      }

      const payload = {
        order_id: order.orderNumber,
        order_amount: Number(order.total),
        order_currency: order.currency || 'INR',
        customer_details: {
          customer_id: order.userId || `guest_${order.id.slice(0, 8)}`,
          customer_email: customerEmail || order.user?.email || shippingAddress.email || '',
          customer_phone: customerPhone || shippingAddress.phone || '',
          customer_name: customerName || order.user?.name || shippingAddress.full_name || 'Customer',
        },
        order_meta: {
          return_url: `${frontendUrl}/payment/success?order_id=${order.id}&gateway=cashfree`,
          notify_url: `${backendUrl}/api/payments/webhook`,
        },
      };

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

      const cfJson = (await cfResponse.json().catch(() => ({}))) as Record<string, unknown>;
      if (!cfResponse.ok) {
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

    const config = getInstamojoConfig();
    if (!config.ok) {
      return res.status(500).json({
        message: config.message,
        required_env: ['ENABLE_INSTAMOJO', 'INSTAMOJO_CLIENT_ID', 'INSTAMOJO_CLIENT_SECRET', 'INSTAMOJO_ENVIRONMENT'],
      });
    }

    const accessToken = await getInstamojoAccessToken(config);
    const redirectUrl = `${frontendUrl}/payment/success?order_id=${order.id}&gateway=instamojo`;
    const webhookUrl = `${backendUrl}/api/payments/webhook`;

    const form = new URLSearchParams();
    form.set('purpose', order.orderNumber);
    form.set('amount', Number(order.total || 0).toFixed(2));
    form.set('buyer_name', customerName || order.user?.name || shippingAddress.full_name || 'Customer');
    form.set('email', customerEmail || order.user?.email || shippingAddress.email || '');
    form.set('phone', customerPhone || shippingAddress.phone || '');
    form.set('redirect_url', redirectUrl);
    form.set('webhook', webhookUrl);
    form.set('send_email', 'false');
    form.set('send_sms', 'false');
    form.set('allow_repeated_payments', 'false');

    const apiBases = [config.apiBaseUrl, config.apiBaseUrlFallback].filter(Boolean) as string[];
    let imJson: Record<string, unknown> = {};
    let success = false;
    let lastCreateError = '';

    for (const apiBase of apiBases) {
      const createUrl = `${apiBase}/payment_requests/`;
      try {
        const imResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });

        imJson = (await imResponse.json().catch(() => ({}))) as Record<string, unknown>;
        if (imResponse.ok) {
          success = true;
          break;
        }
        lastCreateError = `Instamojo create request failed from ${createUrl}: ${JSON.stringify(imJson)}`;
      } catch (error) {
        lastCreateError = `Instamojo payment request endpoint unreachable (${createUrl}): ${error instanceof Error ? error.message : 'fetch failed'}`;
      }
    }

    if (!success) {
      return res.status(400).json({
        message: lastCreateError || 'Failed to create Instamojo payment request',
        instamojo_error: imJson,
      });
    }

    const paymentRequestId = getString(imJson.id);
    const longUrl = getString(imJson.longurl);

    if (!paymentRequestId || !longUrl) {
      return res.status(400).json({ message: 'Instamojo response missing id/longurl', instamojo_error: imJson });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PROCESSING', paymentMethod: 'instamojo', paymentId: paymentRequestId },
    });

    return res.json({
      gateway: 'instamojo',
      payment_request_id: paymentRequestId,
      redirect_url: longUrl,
      environment: config.environment,
      status: 'processing',
    });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create payment order' });
  }
});

router.get('/verify/:orderId', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: { user: true } });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const gateway = (String(req.query.gateway || order.paymentMethod || resolveGateway()).toLowerCase() as GatewayName);

    if (gateway === 'cashfree') {
      const config = getCashfreeConfig();
      if (!config.ok) {
        return res.status(500).json({
          message: config.message,
          required_env: ['ENABLE_CASHFREE', 'CASHFREE_CLIENT_ID', 'CASHFREE_CLIENT_SECRET', 'CASHFREE_ENVIRONMENT'],
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
      } else if (cfPaymentStatus === 'FAILED') {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'FAILED' },
        });
        paymentStatus = 'failed';
      }

      return res.json({
        gateway: 'cashfree',
        order_id: order.id,
        payment_status: paymentStatus,
        order_status: orderStatus,
        payment_details: latestPayment,
      });
    }

    const paymentStatusQuery = String(req.query.payment_status || '').toLowerCase();
    const paymentId = String(req.query.payment_id || '');
    const paymentRequestId = String(req.query.payment_request_id || order.paymentId || '');

    let paymentStatus = 'pending';
    let orderStatus = String(order.status).toLowerCase();

    if (paymentStatusQuery === 'credit') {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'COMPLETED',
          paymentId: paymentId || paymentRequestId || order.paymentId || null,
          status: order.status === 'PENDING' ? 'CONFIRMED' : order.status,
        },
      });
      paymentStatus = 'paid';
      orderStatus = order.status === 'PENDING' ? 'confirmed' : String(order.status).toLowerCase();

      if (order.status === 'PENDING') {
        await markOrderConfirmedAndNotify(order, 'pending');
      }
    } else if (paymentStatusQuery === 'failed') {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'FAILED', paymentId: paymentId || paymentRequestId || order.paymentId || null },
      });
      paymentStatus = 'failed';
    }

    return res.json({
      gateway: 'instamojo',
      order_id: order.id,
      payment_status: paymentStatus,
      order_status: orderStatus,
      payment_details: {
        payment_id: paymentId || null,
        payment_request_id: paymentRequestId || null,
        payment_status: paymentStatusQuery || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to verify payment' });
  }
});

router.post('/webhook', async (_req, res) => {
  // Placeholder for production webhook signature verification and event handling.
  return res.json({ ok: true });
});

export default router;
