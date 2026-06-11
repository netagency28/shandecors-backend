"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const zod_1 = require("zod");
const rateLimiters_1 = require("../middleware/rateLimiters");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
// Validation schemas
const addToWishlistSchema = zod_1.z.object({
    productId: zod_1.z.string(),
});
// Get user's wishlist
router.get('/', rateLimiters_1.userLimiter, auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [wishlistItems, total] = await Promise.all([
            prisma.wishlist.findMany({
                where: { userId },
                include: {
                    product: {
                        include: {
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                skip,
                take: parseInt(limit),
            }),
            prisma.wishlist.count({ where: { userId } }),
        ]);
        res.json({
            items: wishlistItems,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    }
    catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
});
// Check if product is in user's wishlist
router.get('/check/:productId', rateLimiters_1.userLimiter, auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { productId } = req.params;
        const wishlistItem = await prisma.wishlist.findUnique({
            where: {
                userId_productId: {
                    userId,
                    productId,
                },
            },
        });
        res.json({ isInWishlist: !!wishlistItem });
    }
    catch (error) {
        console.error('Error checking wishlist:', error);
        res.status(500).json({ error: 'Failed to check wishlist' });
    }
});
// Add product to wishlist
router.post('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const validatedData = addToWishlistSchema.parse(req.body);
        // Check if product exists
        const product = await prisma.product.findUnique({
            where: { id: validatedData.productId },
        });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // Check if already in wishlist
        const existingItem = await prisma.wishlist.findUnique({
            where: {
                userId_productId: {
                    userId,
                    productId: validatedData.productId,
                },
            },
        });
        if (existingItem) {
            return res.status(400).json({ error: 'Product already in wishlist' });
        }
        const wishlistItem = await prisma.wishlist.create({
            data: {
                userId,
                productId: validatedData.productId,
            },
            include: {
                product: {
                    include: {
                        category: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                },
            },
        });
        res.status(201).json(wishlistItem);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        console.error('Error adding to wishlist:', error);
        res.status(500).json({ error: 'Failed to add to wishlist' });
    }
});
// Remove product from wishlist
router.delete('/:productId', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { productId } = req.params;
        const wishlistItem = await prisma.wishlist.findUnique({
            where: {
                userId_productId: {
                    userId,
                    productId,
                },
            },
        });
        if (!wishlistItem) {
            return res.status(404).json({ error: 'Product not found in wishlist' });
        }
        await prisma.wishlist.delete({
            where: {
                userId_productId: {
                    userId,
                    productId,
                },
            },
        });
        res.json({ message: 'Product removed from wishlist' });
    }
    catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ error: 'Failed to remove from wishlist' });
    }
});
// Clear entire wishlist
router.delete('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await prisma.wishlist.deleteMany({
            where: { userId },
        });
        res.json({ message: 'Wishlist cleared' });
    }
    catch (error) {
        console.error('Error clearing wishlist:', error);
        res.status(500).json({ error: 'Failed to clear wishlist' });
    }
});
// Move item from wishlist to cart
router.post('/move-to-cart/:productId', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { productId } = req.params;
        // Check if product is in wishlist
        const wishlistItem = await prisma.wishlist.findUnique({
            where: {
                userId_productId: {
                    userId,
                    productId,
                },
            },
        });
        if (!wishlistItem) {
            return res.status(404).json({ error: 'Product not found in wishlist' });
        }
        // Get or create user's cart
        let cart = await prisma.cart.findUnique({
            where: { userId },
            include: { items: true },
        });
        if (!cart) {
            cart = await prisma.cart.create({
                data: { userId },
                include: { items: true },
            });
        }
        // Check if product already in cart
        const existingCartItem = cart.items.find(item => item.productId === productId);
        if (existingCartItem) {
            // Update quantity
            await prisma.cartItem.update({
                where: { id: existingCartItem.id },
                data: { quantity: existingCartItem.quantity + 1 },
            });
        }
        else {
            // Add to cart
            await prisma.cartItem.create({
                data: {
                    cartId: cart.id,
                    productId,
                    quantity: 1,
                },
            });
        }
        // Remove from wishlist
        await prisma.wishlist.delete({
            where: {
                userId_productId: {
                    userId,
                    productId,
                },
            },
        });
        res.json({ message: 'Product moved to cart' });
    }
    catch (error) {
        console.error('Error moving to cart:', error);
        res.status(500).json({ error: 'Failed to move to cart' });
    }
});
exports.default = router;
//# sourceMappingURL=wishlist.js.map