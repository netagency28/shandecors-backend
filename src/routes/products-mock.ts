import { Router } from 'express';

const router = Router();

// Mock data for testing without database
const mockProducts = [
  {
    id: '1',
    name: 'Modern Wall Clock',
    slug: 'modern-wall-clock',
    description: 'A sleek contemporary wall clock',
    price: 2999,
    sale_price: 2499,
    sku: 'WC-001',
    stock: 15,
    images: ['https://images.unsplash.com/photo-1608198093002-ad4a00b6b5c5?w=400'],
    category_id: '1',
    category: { id: '1', name: 'Wall Decor', slug: 'wall-decor' },
    is_active: true,
    is_featured: true,
    tags: ['modern', 'clock', 'wall'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Abstract Wall Art',
    slug: 'abstract-wall-art',
    description: 'Beautiful abstract painting for modern spaces',
    price: 5999,
    sale_price: null,
    sku: 'WA-002',
    stock: 8,
    images: ['https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400'],
    category_id: '1',
    category: { id: '1', name: 'Wall Decor', slug: 'wall-decor' },
    is_active: true,
    is_featured: true,
    tags: ['abstract', 'art', 'painting'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '3',
    name: 'Minimalist Vase',
    slug: 'minimalist-vase',
    description: 'Simple elegant vase for modern decor',
    price: 1899,
    sale_price: 1599,
    sku: 'MV-003',
    stock: 20,
    images: ['https://images.unsplash.com/photo-1528629934191-3d609f4c623b?w=400'],
    category_id: '2',
    category: { id: '2', name: 'Accessories', slug: 'accessories' },
    is_active: true,
    is_featured: false,
    tags: ['minimalist', 'vase', 'decor'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: '4',
    name: 'Decorative Mirror',
    slug: 'decorative-mirror',
    description: 'Elegant mirror with ornate frame',
    price: 8999,
    sale_price: null,
    sku: 'DM-004',
    stock: 5,
    images: ['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400'],
    category_id: '1',
    category: { id: '1', name: 'Wall Decor', slug: 'wall-decor' },
    is_active: true,
    is_featured: true,
    tags: ['mirror', 'wall', 'elegant'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

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
  }
];

// Mock product routes
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const featured = req.query.featured === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;

    let filteredProducts = mockProducts;

    // Filter by featured
    if (featured) {
      filteredProducts = filteredProducts.filter(p => p.is_featured);
    }

    // Filter by search
    if (search) {
      filteredProducts = filteredProducts.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        p.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Filter by category
    if (category) {
      filteredProducts = filteredProducts.filter(p =>
        p.category_id === category || p.category.slug === category
      );
    }

    // Apply limit
    const products = filteredProducts.slice(0, limit);

    return res.json({
      products,
      total: filteredProducts.length,
      page: 1,
      limit
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch products' });
  }
});

router.get('/id/:id', async (req, res) => {
  try {
    const product = mockProducts.find(p => p.id === req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    return res.json(product);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch product' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const product = mockProducts.find(p => p.slug === req.params.slug);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    return res.json(product);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch product' });
  }
});

export default router;
