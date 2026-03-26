import { Router } from 'express';
import getPrismaClient from '../services/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const toCartItem = (item: any) => ({
  id: item.id,
  product_id: item.productId,
  quantity: item.quantity,
  product: item.product
    ? {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        price: item.product.price,
        sale_price: item.product.comparePrice,
        images: item.product.images,
        stock: item.product.stock,
      }
    : null,
});

const getOrCreateCart = async (userId: string) => {
  const prisma = getPrismaClient();
  const existing = await prisma.cart.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId } });
};

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const prisma = getPrismaClient();
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.id },
      include: { items: { include: { product: true } } },
    });

    return res.json({ items: (cart?.items || []).map(toCartItem) });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch cart' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const prisma = getPrismaClient();
    const cart = await getOrCreateCart(req.user.id);
    const productId = req.body?.product_id;
    const quantity = Number(req.body?.quantity || 1);

    if (!productId) return res.status(400).json({ message: 'product_id is required' });

    const item = await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity: { increment: quantity } },
      include: { product: true },
    });

    return res.status(201).json(toCartItem(item));
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to add to cart' });
  }
});

router.put('/:itemId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const prisma = getPrismaClient();
    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const updated = await prisma.cartItem.updateMany({
      where: { id: req.params.itemId, cartId: cart.id },
      data: { quantity: Number(req.body?.quantity || 1) },
    });

    if (!updated.count) return res.status(404).json({ message: 'Cart item not found' });

    const item = await prisma.cartItem.findUnique({
      where: { id: req.params.itemId },
      include: { product: true },
    });

    return res.json(item ? toCartItem(item) : null);
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update cart item' });
  }
});

router.delete('/:itemId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const prisma = getPrismaClient();
    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    await prisma.cartItem.deleteMany({ where: { id: req.params.itemId, cartId: cart.id } });
    return res.json({ message: 'Cart item removed' });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to remove cart item' });
  }
});

router.delete('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const prisma = getPrismaClient();
    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    return res.json({ message: 'Cart cleared' });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to clear cart' });
  }
});

export default router;
