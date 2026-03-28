"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectPrisma = exports.getPrismaClient = void 0;
const client_1 = require("@prisma/client");
let prisma = null;
const getPrismaClient = () => {
    if (!prisma) {
        console.log('Creating new Prisma client...');
        console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
        console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length || 0);
        if (!process.env.DATABASE_URL) {
            console.error('❌ DATABASE_URL is not set!');
            throw new Error('DATABASE_URL environment variable is not set');
        }
        prisma = new client_1.PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
            datasources: {
                db: {
                    url: process.env.DATABASE_URL
                }
            }
        });
        // Test the connection
        prisma.$connect()
            .then(() => {
            console.log('✅ Database connected successfully');
        })
            .catch((error) => {
            console.error('❌ Database connection failed:', error.message);
            console.error('Connection details:', {
                url: process.env.DATABASE_URL?.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
                hasUrl: !!process.env.DATABASE_URL
            });
        });
    }
    return prisma;
};
exports.getPrismaClient = getPrismaClient;
const disconnectPrisma = async () => {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
    }
};
exports.disconnectPrisma = disconnectPrisma;
exports.default = exports.getPrismaClient;
//# sourceMappingURL=database.js.map