import { Router } from 'express';
import authRoutes from './auth';
import productRoutes from './products-mock'; // Use mock instead of database
import cartRoutes from './cart';
import orderRoutes from './orders';
import userRoutes from './users';
import adminRoutes from './admin';
import uploadRoutes from './upload';
import testRoutes from './test';
import categoryRoutes from './categories-mock'; // Use mock instead of database
import paymentRoutes from './payments';
import seedRoutes from './seed';
import contentRoutes from './content';

const router = Router();

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/upload', uploadRoutes);
router.use('/test', testRoutes);
router.use('/seed', seedRoutes);
router.use('/content', contentRoutes);

export default router;
