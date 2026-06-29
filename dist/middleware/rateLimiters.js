"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactLimiter = exports.aiLimiter = exports.webhookLimiter = exports.adminLimiter = exports.userLimiter = exports.checkoutLimiter = exports.authLimiter = exports.browseLimiter = void 0;
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const rate_limit_redis_1 = require("rate-limit-redis");
const redis_1 = require("../config/redis");
const makeStore = (prefix) => {
    if (!redis_1.redisClient)
        return undefined;
    return new rate_limit_redis_1.RedisStore({
        sendCommand: (command, ...args) => redis_1.redisClient.call(command, ...args),
        prefix: `rl:${prefix}:`,
    });
};
const makeHandler = (message, windowMs) => (req, res) => {
    const retryAfter = Math.ceil(windowMs / 1000);
    console.warn(`[RateLimit] IP=${req.ip} route=${req.path} time=${new Date().toISOString()}`);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfter,
    });
};
const skipOptions = (req) => req.method === 'OPTIONS';
// 1. Browse — product listing, categories, search
exports.browseLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipOptions,
    store: makeStore('browse'),
    handler: makeHandler('Too many browse requests. Please slow down.', 15 * 60 * 1000),
});
// 2. Auth — login, signup, forgot-password
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipOptions,
    store: makeStore('auth'),
    handler: makeHandler('Too many authentication attempts. Please try again in 15 minutes.', 15 * 60 * 1000),
});
// 3. Checkout — cart, orders, payment creation
exports.checkoutLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipOptions,
    store: makeStore('checkout'),
    handler: makeHandler('Too many checkout requests. Please wait a moment.', 60 * 1000),
});
// 4. User — order history, profile, wishlist
exports.userLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipOptions,
    store: makeStore('user'),
    handler: makeHandler('Too many requests. Please try again shortly.', 15 * 60 * 1000),
});
// 5. Admin — all /admin/* routes
exports.adminLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipOptions,
    store: makeStore('admin'),
    handler: makeHandler('Too many admin requests. Please slow down.', 15 * 60 * 1000),
});
// 6. Webhook — Cashfree and Instamojo callbacks
exports.webhookLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipOptions,
    store: makeStore('webhook'),
    handler: makeHandler('Too many webhook requests.', 60 * 1000),
});
// 7. AI — per-user (not IP) for routes calling Anthropic/OpenAI/Google AI
exports.aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.user?.id || (0, express_rate_limit_1.ipKeyGenerator)(req.ip || 'unknown'),
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipOptions,
    store: makeStore('ai'),
    handler: makeHandler('AI usage limit reached. Please try again in an hour.', 60 * 60 * 1000),
});
// 8. Contact form
exports.contactLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipOptions,
    store: makeStore('contact'),
    handler: makeHandler('Too many contact requests. Please try again later.', 60 * 60 * 1000),
});
//# sourceMappingURL=rateLimiters.js.map