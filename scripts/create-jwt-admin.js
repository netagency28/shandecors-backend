const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function createJWTAdmin() {
  try {
    // Get admin user
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@shandecor.com' },
    });

    if (!adminUser) {
      console.log('Admin user not found');
      return;
    }

    // Create proper JWT token
    const token = jwt.sign(
      { 
        userId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        name: adminUser.name
      },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '1h' }
    );

    console.log('JWT Token created for admin:', token);
    console.log('Use this token to access admin endpoints');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createJWTAdmin();
