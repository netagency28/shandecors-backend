"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectPrisma = exports.getPrismaClient = void 0;
const client_1 = require("@prisma/client");
let prisma = null;
const getPrismaClient = () => {
    if (!prisma) {
        prisma = new client_1.PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
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