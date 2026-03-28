import { Router } from 'express';

const router = Router();

// Mock categories data
const mockCategories = [
  {
    id: '1',
    name: 'Wall Decor',
    slug: 'wall-decor',
    description: 'Beautiful wall decorations and art pieces',
    image_url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Accessories',
    slug: 'accessories',
    description: 'Decorative accessories for your home',
    image_url: 'https://images.unsplash.com/photo-1528629934191-3d609f4c623b?w=400',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '3',
    name: 'Lighting',
    slug: 'lighting',
    description: 'Modern lighting solutions',
    image_url: 'https://images.unsplash.com/photo-1513506003789-5e024b9c5b32?w=400',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '4',
    name: 'Furniture',
    slug: 'furniture',
    description: 'Contemporary furniture pieces',
    image_url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

router.get('/', async (_req, res) => {
  try {
    return res.json(mockCategories);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch categories' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const category = mockCategories.find(c => c.slug === req.params.slug);

    if (!category || !category.is_active) {
      return res.status(404).json({ message: 'Category not found' });
    }

    return res.json(category);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch category' });
  }
});

export default router;
