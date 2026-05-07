import { Router } from 'express';
import authRoutes from './auth';
import productRoutes from './products';
import cartRoutes from './cart';
import orderRoutes from './orders';
import userRoutes from './users';
import addressRoutes from './addresses';
import adminRoutes from './admin';
import uploadRoutes from './upload';
import testRoutes from './test';
import categoryRoutes from './categories';
import paymentRoutes from './payments';
import seedRoutes from './seed';
import contentRoutes from './content';
import reviewRoutes from './reviews';
import wishlistRoutes from './wishlist';

const router = Router();

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/users', userRoutes);
router.use('/addresses', addressRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/upload', uploadRoutes);
router.use('/test', testRoutes);
router.use('/seed', seedRoutes);
router.use('/content', contentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/wishlist', wishlistRoutes);

export default router;
