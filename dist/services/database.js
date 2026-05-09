"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectPrisma = exports.getPrismaClient = void 0;
const client_1 = require("@prisma/client");
let prisma = null;
const getPrismaClient = () => {
    if (!prisma) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL environment variable is not set');
        }
        prisma = new client_1.PrismaClient({
            // Only surface warnings and errors — suppress noisy query logs in all envs
            log: ['warn', 'error'],
            datasources: { db: { url: process.env.DATABASE_URL } },
        });
        prisma.$connect()
            .then(() => console.log('✅ Database connected'))
            .catch((error) => console.error('❌ Database connection failed:', error.message));
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