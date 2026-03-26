import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    console.log('Creating new Prisma client...');
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
    
    prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
    
    // Test the connection
    prisma.$connect()
      .then(() => {
        console.log('✅ Database connected successfully');
      })
      .catch((error) => {
        console.error('❌ Database connection failed:', error);
      });
  }
  return prisma;
};

export const disconnectPrisma = async (): Promise<void> => {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
};

export default getPrismaClient;
