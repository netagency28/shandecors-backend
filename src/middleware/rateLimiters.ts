import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { redisClient } from '../config/redis';

const makeStore = (prefix: string) => {
  if (!redisClient) return undefined;
  return new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redisClient!.call(command, ...args) as Promise<RedisReply>,
    prefix: `rl:${prefix}:`,
  });
};

const makeHandler = (message: string, windowMs: number) =>
  (req: Request, res: Response) => {
    const retryAfter = Math.ceil(windowMs / 1000);
    console.warn(
      `[RateLimit] IP=${req.ip} route=${req.path} time=${new Date().toISOString()}`
    );
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message,
      retryAfter,
    });
  };

const skipOptions = (req: Request) => req.method === 'OPTIONS';

// 1. Browse — product listing, categories, search
export const browseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  store: makeStore('browse'),
  handler: makeHandler('Too many browse requests. Please slow down.', 15 * 60 * 1000),
});

// 2. Auth — login, signup, forgot-password
export const authLimiter = rateLimit({
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
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  store: makeStore('checkout'),
  handler: makeHandler('Too many checkout requests. Please wait a moment.', 60 * 1000),
});

// 4. User — order history, profile, wishlist
export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  store: makeStore('user'),
  handler: makeHandler('Too many requests. Please try again shortly.', 15 * 60 * 1000),
});

// 5. Admin — all /admin/* routes
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  store: makeStore('admin'),
  handler: makeHandler('Too many admin requests. Please slow down.', 15 * 60 * 1000),
});

// 6. Webhook — Cashfree and Instamojo callbacks
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  store: makeStore('webhook'),
  handler: makeHandler('Too many webhook requests.', 60 * 1000),
});

// 7. AI — per-user (not IP) for routes calling Anthropic/OpenAI/Google AI
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req: Request) => (req as any).user?.id || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  store: makeStore('ai'),
  handler: makeHandler('AI usage limit reached. Please try again in an hour.', 60 * 60 * 1000),
});
