"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
let redisClient = null;
exports.redisClient = redisClient;
if (process.env.REDIS_URL) {
    exports.redisClient = redisClient = new ioredis_1.default(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableReadyCheck: false,
    });
    redisClient.on('connect', () => console.log('✅ Redis connected'));
    redisClient.on('error', (err) => console.error('❌ Redis error (rate-limiting will fall back to memory):', err.message));
}
//# sourceMappingURL=redis.js.map