import { Router } from 'express';
import getPrismaClient from '../services/database';

const router = Router();

// GET /api/test/db - Test database connection
router.get('/db', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    
    // Test connection
    await prisma.$connect();
    
    // Test query
    const userCount = await prisma.user.count();
    
    res.json({
      success: true,
      data: {
        message: 'Database connection successful',
        userCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Database connection failed',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
