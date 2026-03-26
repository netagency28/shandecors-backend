import { Router } from 'express';
import getPrismaClient from '../services/database';

const router = Router();

const toClientCategory = (category: any) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description,
  image_url: category.image,
  is_active: category.isActive,
  created_at: category.createdAt,
  updated_at: category.updatedAt,
});

router.get('/', async (_req, res) => {
  try {
    const prisma = getPrismaClient();
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return res.json(categories.map(toClientCategory));
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch categories' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const category = await prisma.category.findUnique({ where: { slug: req.params.slug } });

    if (!category || !category.isActive) {
      return res.status(404).json({ message: 'Category not found' });
    }

    return res.json(toClientCategory(category));
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch category' });
  }
});

export default router;
