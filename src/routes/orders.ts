import { Router } from 'express';
import getPrismaClient from '../services/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { checkoutLimiter, userLimiter } from '../middleware/rateLimiters';
import { buildOrderAdminPayload, notifyAdminOrderEventSafe } from '../services/admin-notifications';
import { createCheckoutToken } from '../services/checkout-token';
import { validateAndPriceOrder } from '../services/order-pricing';
import { excludeCodOrdersWhere } from '../utils/order-filters';

const router = Router();

const statusToClient = (status: string) => status.toLowerCase();
const paymentToClient = (status: string) => {
  if (status === 'COMPLETED') return 'paid';
  if (status === 'FAILED') return 'failed';
  if (status === 'REFUNDED') return 'refunded';
  return 'pending';
};

const toClientOrder = (order: any) => ({
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
  items:
    order.items?.map((item: any) => ({
      id: item.id,
      product_id: item.productId,
      quantity: item.quantity,
      price: item.price,
      ...(item.productSnapshot || {}),
    })) || [],
});

const getOrCreateUser = async (email: string, name?: string | null, phone?: string | null) => {
  const prisma = getPrismaClient();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

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

const createOrderFromRequest = async (params: {
  userId: string;
  body: Record<string, unknown>;
  shippingAddress: unknown;
  billingAddress: unknown;
}) => {
  const { userId, body, shippingAddress, billingAddress } = params;
  const priced = await validateAndPriceOrder(body.items);
  const prisma = getPrismaClient();

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
      shippingAddress: shippingAddress as object,
      billingAddress: billingAddress as object,
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

router.get('/', userLimiter, authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const prisma = getPrismaClient();
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id, ...excludeCodOrdersWhere },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ orders: orders.map(toClientOrder) });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch orders' });
  }
});

router.get('/:orderId', userLimiter, authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const prisma = getPrismaClient();
    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, userId: req.user.id, ...excludeCodOrdersWhere },
      include: { items: true },
    });

    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.json(toClientOrder(order));
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch order' });
  }
});

router.post('/', checkoutLimiter, authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const body = req.body || {};
    const created = await createOrderFromRequest({
      userId: req.user.id,
      body,
      shippingAddress: body.shipping_address || null,
      billingAddress: body.billing_address || body.shipping_address || null,
    });

    notifyAdminOrderEventSafe(buildOrderAdminPayload(created, 'order_placed'));

    return res.status(201).json({
      ...toClientOrder(created),
      checkout_token: createCheckoutToken(created.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create order';
    const statusCode = message.includes('unavailable') || message.includes('stock') || message.includes('Invalid')
      ? 400
      : 500;
    return res.status(statusCode).json({ message });
  }
});

router.post('/guest', checkoutLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const shipping = body.shipping_address || {};

    const email = typeof shipping.email === 'string' ? shipping.email.trim() : '';
    if (!email) {
      return res.status(400).json({ message: 'Guest checkout requires email' });
    }

    const guest = await getOrCreateUser(
      email,
      typeof shipping.full_name === 'string' ? shipping.full_name : null,
      typeof shipping.phone === 'string' ? shipping.phone : null,
    );

    const created = await createOrderFromRequest({
      userId: guest.id,
      body,
      shippingAddress: shipping,
      billingAddress: body.billing_address || shipping,
    });

    notifyAdminOrderEventSafe(buildOrderAdminPayload(created, 'order_placed'));

    return res.status(201).json({
      ...toClientOrder(created),
      checkout_token: createCheckoutToken(created.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create guest order';
    const statusCode = message.includes('unavailable') || message.includes('stock') || message.includes('Invalid')
      ? 400
      : 500;
    return res.status(statusCode).json({ message });
  }
});

export default router;
