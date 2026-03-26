import { Router } from 'express';

const router = Router();

// GET /api/users/profile - Get user profile
router.get('/profile', (req, res) => {
  res.json({
    success: true,
    data: null,
    message: 'User profile endpoint - to be implemented',
  });
});

export default router;
