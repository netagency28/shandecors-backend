import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import { getPrismaClient, disconnectPrisma } from './services/database';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true });

// Fail fast if required environment variables are missing
const validateEnv = () => {
  const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_KEY', 'FRONTEND_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
};

validateEnv();

const app = express();

const normalizeOrigin = (origin: string) => origin.trim().replace(/\/+$/, '');

const parseAllowedOrigins = () => {
  const configuredOrigins = [
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
    process.env.CORS_ORIGIN,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://shandecors.store',
    'https://www.shandecors.store',
  ];

  return Array.from(new Set([...configuredOrigins, ...defaultOrigins]));
};

const allowedOrigins = parseAllowedOrigins();

const isOriginAllowed = (origin?: string) => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(normalizeOrigin(origin));
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, origin ? normalizeOrigin(origin) : true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

console.log('🔧 CORS Configuration:', {
  allowedOrigins,
  credentials: corsOptions.credentials,
  methods: corsOptions.methods,
});

// Trust Render's reverse proxy so rate limiting uses the real client IP
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Compact request logger: METHOD /path STATUS ms
morgan.token('status-color', (_req, res) => {
  const s = res.statusCode;
  if (s >= 500) return `\x1b[31m${s}\x1b[0m`; // red
  if (s >= 400) return `\x1b[33m${s}\x1b[0m`; // yellow
  return `\x1b[32m${s}\x1b[0m`;                // green
});

const httpLogger = morgan(
  ':method :url :status-color :response-time ms',
  {
    // Skip noisy Render health pings from the log entirely
    skip: (req) => req.url === '/health',
  }
);

// Middleware
app.use(helmet());
app.use(compression());
app.use(httpLogger);

// Health check must be before rate limiter — Render pings every 5s and would exhaust the limit
app.get('/health', async (_req, res) => {
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// Explicit preflight handler
app.options('*', cors(corsOptions));

app.use(limiter);
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple test endpoint (no database required)
app.get('/test', (req, res) => {
  res.status(200).json({
    message: 'CORS Test Endpoint - Working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      HAS_DB_URL: !!process.env.DATABASE_URL
    }
  });
});

// Debug endpoint for CORS testing
app.get('/debug-cors', (req, res) => {
  res.status(200).json({
    message: 'CORS Debug Endpoint',
    origin: req.headers.origin,
    allowedOrigins,
    headers: req.headers,
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api', routes);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 8000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await disconnectPrisma();
    console.log('Server shut down gracefully');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
