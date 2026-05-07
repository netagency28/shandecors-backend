"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../services/database"));
const router = express_1.default.Router();
const prisma = (0, database_1.default)();
// Validation schemas
const createReviewSchema = zod_1.z.object({
    productId: zod_1.z.string(),
    rating: zod_1.z.number().min(1).max(5),
    comment: zod_1.z.string().optional(),
});
const updateReviewSchema = zod_1.z.object({
    rating: zod_1.z.number().min(1).max(5).optional(),
    comment: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().optional(),
});
// Get reviews for a product
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 10, rating } = req.query;
        const where = {
            productId,
            isActive: true,
            moderationStatus: 'APPROVED',
        };
        if (rating) {
            where.rating = parseInt(rating);
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [reviews, total] = await Promise.all([
            prisma.review.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                skip,
                take: parseInt(limit),
            }),
            prisma.review.count({ where }),
        ]);
        // Calculate rating distribution
        const ratingStats = await prisma.review.groupBy({
            by: ['rating'],
            where: {
                productId,
                isActive: true,
                moderationStatus: 'APPROVED',
            },
            _count: {
                rating: true,
            },
        });
        const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
            rating,
            count: ratingStats.find(stat => stat.rating === rating)?._count.rating || 0,
        }));
        const averageRating = reviews.length > 0
            ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
            : 0;
        res.json({
            reviews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
            stats: {
                averageRating: Math.round(averageRating * 10) / 10,
                totalReviews: total,
                ratingDistribution,
            },
        });
    }
    catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});
// Get user's review for a product
router.get('/user/:productId', auth_1.authenticateToken, async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user.id;
        const review = await prisma.review.findUnique({
            where: {
                productId_userId: {
                    productId,
                    userId,
                },
            },
        });
        res.json(review);
    }
    catch (error) {
        console.error('Error fetching user review:', error);
        res.status(500).json({ error: 'Failed to fetch review' });
    }
});
// Create a review
router.post('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const validatedData = createReviewSchema.parse(req.body);
        // Check if user has purchased the product
        const hasPurchased = await prisma.orderItem.findFirst({
            where: {
                productId: validatedData.productId,
                order: {
                    userId,
                    status: {
                        in: ['DELIVERED', 'PROCESSING', 'SHIPPED'],
                    },
                },
            },
        });
        // Check if user already reviewed this product
        const existingReview = await prisma.review.findUnique({
            where: {
                productId_userId: {
                    productId: validatedData.productId,
                    userId,
                },
            },
        });
        if (existingReview) {
            return res.status(400).json({ error: 'You have already reviewed this product' });
        }
        const review = await prisma.review.create({
            data: {
                productId: validatedData.productId,
                userId,
                rating: validatedData.rating,
                comment: validatedData.comment,
                isVerified: !!hasPurchased,
                moderationStatus: 'PENDING',
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
        res.status(201).json(review);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2003' &&
            String(error.meta?.field_name ?? '').includes('productId')) {
            return res.status(400).json({
                error: 'Product not found for this review. Refresh the product page and try again.',
            });
        }
        console.error('Error creating review:', error);
        res.status(500).json({ error: 'Failed to create review' });
    }
});
// Update a review
router.put('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const validatedData = updateReviewSchema.parse(req.body);
        // Check if review belongs to user or user is admin
        const review = await prisma.review.findUnique({
            where: { id },
        });
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        if (review.userId !== userId && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized to update this review' });
        }
        const data = req.user.role === 'ADMIN'
            ? validatedData
            : {
                ...(validatedData.rating !== undefined ? { rating: validatedData.rating } : {}),
                ...(validatedData.comment !== undefined ? { comment: validatedData.comment } : {}),
                ...(review.moderationStatus === 'REJECTED' &&
                    (validatedData.rating !== undefined || validatedData.comment !== undefined)
                    ? { moderationStatus: 'PENDING' }
                    : {}),
            };
        if (req.user.role !== 'ADMIN' && Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        const updatedReview = await prisma.review.update({
            where: { id },
            data,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
        res.json(updatedReview);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        console.error('Error updating review:', error);
        res.status(500).json({ error: 'Failed to update review' });
    }
});
// Delete a review
router.delete('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        // Check if review belongs to user or user is admin
        const review = await prisma.review.findUnique({
            where: { id },
        });
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        if (review.userId !== userId && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized to delete this review' });
        }
        await prisma.review.delete({
            where: { id },
        });
        res.json({ message: 'Review deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ error: 'Failed to delete review' });
    }
});
exports.default = router;
//# sourceMappingURL=reviews.js.map