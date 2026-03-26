const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function setAdminRole() {
  try {
    // Update user to admin role
    const updatedUser = await prisma.user.update({
      where: { email: 'sanjayvihaan111@gmail.com' },
      data: { 
        role: 'ADMIN',
        updatedAt: new Date(),
      },
    });

    console.log('User updated to admin role:', updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setAdminRole();
