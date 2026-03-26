const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    // Create admin user directly in database
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@shandecor.com',
        name: 'Admin User',
        role: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log('Admin user created:', adminUser);
    console.log('Email: admin@shandecor.com');
    console.log('Password: admin123456 (use this to login)');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
