import { Router } from 'express';
import getPrismaClient from '../services/database';
import { adminMiddleware, authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { ALLOWED_CONTENT_SLUGS, readSiteContent, readSiteContentEntry, updateSiteContentEntry } from '../services/contentStore';
import { sendOrderStatusEmail } from '../services/email';

const router = Router();
router.use(authMiddleware, adminMiddleware);

const toClientProduct = (product: any) => ({
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

const toClientOrder = (order: any) => ({
  id: order.id,
  order_number: order.orderNumber,
  status: String(order.status).toLowerCase(),
  subtotal: order.subtotal,
  shipping_fee: order.shipping,
  tax: order.tax,
  total: order.total,
  payment_method: order.paymentMethod,
  payment_status:
    order.paymentStatus === 'COMPLETED'
      ? 'paid'
      : order.paymentStatus === 'FAILED'
        ? 'failed'
        : 'pending',
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

const parseOrderStatus = (status?: string) => {
  if (!status) return undefined;
  const normalized = status.toUpperCase();
  const allowed = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
  return allowed.includes(normalized) ? normalized : undefined;
};

const getShippingAddress = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const getString = (value: unknown) => (typeof value === 'string' ? value : '');

const buildDailySeries = (orders: Array<{ createdAt: Date; total: number }>) => {
  const map = new Map<string, number>();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, 0);
  }
  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) || 0) + Number(order.total || 0));
  }
  return Array.from(map.entries()).map(([date, revenue]) => ({ date, revenue }));
};

const buildWeeklySeries = (orders: Array<{ createdAt: Date; total: number }>) => {
  const map = new Map<string, number>();
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
    if (map.has(key)) map.set(key, (map.get(key) || 0) + Number(order.total || 0));
  }

  return Array.from(map.entries()).map(([week_start, revenue]) => ({ week_start, revenue }));
};

router.get('/dashboard', async (_req: AuthenticatedRequest, res) => {
  try {
    const prisma = getPrismaClient();

    const paidWhere = { paymentStatus: 'COMPLETED' as const };
    const incomingWhere: any = {
      paymentStatus: { in: ['PENDING', 'PROCESSING'] },
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    };

    const [
      totalOrders,
      totalProducts,
      activeProducts,
      totalUsers,
      revenueAgg,
      incomingAgg,
      grouped,
      recent,
      paidOrders,
      lowStockProducts,
      orderItemGrouped,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.order.aggregate({ _sum: { total: true }, where: paidWhere }),
      prisma.order.aggregate({ _sum: { total: true }, where: incomingWhere }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      prisma.order.findMany({ where: paidWhere, select: { createdAt: true, total: true } }),
      prisma.product.findMany({ where: { isActive: true, stock: { lte: 5 } }, orderBy: { stock: 'asc' }, take: 8 }),
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

    const orders_by_status: Record<string, number> = {};
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
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Dashboard fetch failed' });
  }
});

router.get('/products', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const where: any = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return res.json({ products: products.map(toClientProduct) });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch admin products' });
  }
});

router.post('/products', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const body = req.body || {};

    const created = await prisma.product.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description || null,
        price: Number(body.price || 0),
        comparePrice: body.sale_price !== undefined && body.sale_price !== null ? Number(body.sale_price) : null,
        sku: body.sku || `SKU-${Date.now()}`,
        stock: Number(body.stock || 0),
        images: Array.isArray(body.images) ? body.images : [],
        categoryId: body.category_id,
        isActive: body.is_active !== false,
        isFeatured: body.is_featured === true,
        tags: Array.isArray(body.tags) ? body.tags : [],
      },
      include: { category: true },
    });

    return res.status(201).json(toClientProduct(created));
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create product' });
  }
});

router.put('/products/:productId', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const body = req.body || {};

    const updated = await prisma.product.update({
      where: { id: req.params.productId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.price !== undefined ? { price: Number(body.price) } : {}),
        ...(body.sale_price !== undefined ? { comparePrice: body.sale_price === null ? null : Number(body.sale_price) } : {}),
        ...(body.sku !== undefined ? { sku: body.sku } : {}),
        ...(body.stock !== undefined ? { stock: Number(body.stock) } : {}),
        ...(body.images !== undefined ? { images: Array.isArray(body.images) ? body.images : [] } : {}),
        ...(body.category_id !== undefined ? { categoryId: body.category_id } : {}),
        ...(body.is_active !== undefined ? { isActive: Boolean(body.is_active) } : {}),
        ...(body.is_featured !== undefined ? { isFeatured: Boolean(body.is_featured) } : {}),
        ...(body.tags !== undefined ? { tags: Array.isArray(body.tags) ? body.tags : [] } : {}),
      },
      include: { category: true },
    });

    return res.json(toClientProduct(updated));
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update product' });
  }
});

router.delete('/products/:productId', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    await prisma.product.delete({ where: { id: req.params.productId } });
    return res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to delete product' });
  }
});

router.post('/products/bulk-delete', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ message: 'ids is required' });

    const prisma = getPrismaClient();
    const result = await prisma.product.deleteMany({ where: { id: { in: ids } } });
    return res.json({ deleted: result.count });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed bulk delete' });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const parsedStatus = parseOrderStatus(typeof req.query.status === 'string' ? req.query.status : undefined);

    const orders = await prisma.order.findMany({
      where: parsedStatus ? { status: parsedStatus as any } : undefined,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return res.json({ orders: orders.map(toClientOrder) });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch admin orders' });
  }
});

router.get('/orders/:orderId', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { items: true },
    });

    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.json(toClientOrder(order));
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch order' });
  }
});

router.put('/orders/:orderId/status', async (req, res) => {
  try {
    const prisma = getPrismaClient();
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
      data: { status: nextStatus as any },
      include: { items: true, user: true },
    });

    const shipping = getShippingAddress(updated.shippingAddress);
    const customerEmail = getString(updated.user?.email) || getString(shipping.email);
    if (customerEmail && String(existing.status) !== String(updated.status)) {
      await sendOrderStatusEmail({
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
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update order status' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const body = req.body || {};

    const created = await prisma.category.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description || null,
        image: body.image_url || null,
        isActive: body.is_active !== false,
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
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create category' });
  }
});

router.delete('/categories/:categoryId', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    await prisma.category.delete({ where: { id: req.params.categoryId } });
    return res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to delete category' });
  }
});

router.get('/users', async (_req: AuthenticatedRequest, res) => {
  try {
    const prisma = getPrismaClient();
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
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch users' });
  }
});

router.put('/users/:id/role', async (req: AuthenticatedRequest, res) => {
  try {
    const { role } = req.body;

    if (!['CUSTOMER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const prisma = getPrismaClient();
    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
    });

    return res.json(updatedUser);
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update user role' });
  }
});

router.get('/content', async (_req, res) => {
  try {
    const content = await readSiteContent();
    return res.json(content);
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch content pages' });
  }
});

router.get('/content/:slug', async (req, res) => {
  try {
    const entry = await readSiteContentEntry(req.params.slug);
    if (!entry) {
      return res.status(404).json({
        message: 'Content page not found',
        allowed_slugs: ALLOWED_CONTENT_SLUGS,
      });
    }

    return res.json({
      slug: req.params.slug,
      ...entry,
    });
  } catch (error) {
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

    const updated = await updateSiteContentEntry(req.params.slug, { title, body });
    if (!updated) {
      return res.status(404).json({
        message: 'Content page not found',
        allowed_slugs: ALLOWED_CONTENT_SLUGS,
      });
    }

    return res.json({
      slug: req.params.slug,
      ...updated,
    });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update content page' });
  }
});

export default router;
