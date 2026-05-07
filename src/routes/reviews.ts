import express from 'express';
import { Prisma } from '@prisma/client';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { z } from 'zod';
import getPrismaClient from '../services/database';

const router = express.Router();
const prisma = getPrismaClient();

// Validation schemas
const createReviewSchema = z.object({
  productId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

const updateReviewSchema = z.object({
  rating: z.number().min(1).max(5).optional(),
  comment: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Get reviews for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

    const where: any = {
      productId,
      isActive: true,
      moderationStatus: 'APPROVED',
    };

    if (rating) {
      where.rating = parseInt(rating as string);
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

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
        take: parseInt(limit as string),
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
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
      stats: {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: total,
        ratingDistribution,
      },
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get user's review for a product
router.get('/user/:productId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user!.id;

    const review = await prisma.review.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });

    res.json(review);
  } catch (error) {
    console.error('Error fetching user review:', error);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

// Create a review
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003' &&
      String(error.meta?.field_name ?? '').includes('productId')
    ) {
      return res.status(400).json({
        error: 'Product not found for this review. Refresh the product page and try again.',
      });
    }
    console.error('Error creating review:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// Update a review
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const validatedData = updateReviewSchema.parse(req.body);

    // Check if review belongs to user or user is admin
    const review = await prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (review.userId !== userId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to update this review' });
    }

    const data =
      req.user!.role === 'ADMIN'
        ? validatedData
        : {
            ...(validatedData.rating !== undefined ? { rating: validatedData.rating } : {}),
            ...(validatedData.comment !== undefined ? { comment: validatedData.comment } : {}),
            ...(review.moderationStatus === 'REJECTED' &&
            (validatedData.rating !== undefined || validatedData.comment !== undefined)
              ? { moderationStatus: 'PENDING' as const }
              : {}),
          };

    if (req.user!.role !== 'ADMIN' && Object.keys(data).length === 0) {
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error updating review:', error);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Delete a review
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if review belongs to user or user is admin
    const review = await prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (review.userId !== userId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to delete this review' });
    }

    await prisma.review.delete({
      where: { id },
    });

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

export default router;
