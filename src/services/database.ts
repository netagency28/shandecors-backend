import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    prisma = new PrismaClient({
      // Only surface warnings and errors — suppress noisy query logs in all envs
      log: ['warn', 'error'],
      datasources: { db: { url: process.env.DATABASE_URL } },
    });

    prisma.$connect()
      .then(() => console.log('✅ Database connected'))
      .catch((error: Error) => console.error('❌ Database connection failed:', error.message));
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
