import { Router } from 'express';
import { z } from 'zod';
import getPrismaClient from '../services/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
});

router.get('/profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const prisma = getPrismaClient();

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, email: true, name: true, phone: true, role: true },
    });

    return res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
