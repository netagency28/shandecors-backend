import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import routes from './routes';

// Load environment variables
dotenv.config();

// Debug environment variables
console.log('🔧 Environment Variables Debug:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- PORT:', process.env.PORT);
console.log('- DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('- DATABASE_URL length:', process.env.DATABASE_URL?.length || 0);
console.log('- FRONTEND_URL:', process.env.FRONTEND_URL);

// Ensure DATABASE_URL is properly set
if (!process.env.DATABASE_URL) {
  console.error('❌ CRITICAL: DATABASE_URL is not set!');
  console.error('❌ Make sure to set DATABASE_URL in Render environment variables!');
  // Fallback for testing (remove this in production)
  process.env.DATABASE_URL = "postgresql://postgres:Netagency$core@db.qkrcnxrabkmqrnlplagf.supabase.co:5432/postgres";
  console.log('⚠️  Using fallback DATABASE_URL for testing');
}

const app = express();
const server = createServer(app);

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
    'https://shandecors.vercel.app',
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

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// Explicit preflight handler
app.options('*', cors(corsOptions));

app.use(limiter);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

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

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export { io };
