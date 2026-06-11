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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const Sentry = __importStar(require("@sentry/node"));
const errorHandler_1 = require("./middleware/errorHandler");
const routes_1 = __importDefault(require("./routes"));
const sitemap_1 = __importDefault(require("./routes/sitemap"));
const database_1 = require("./services/database");
// Load environment variables
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '.env'), override: true });
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
const app = (0, express_1.default)();
// Sentry must be initialised before any middleware so it can instrument Express
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        integrations: [
            new Sentry.Integrations.Http({ tracing: true }),
            new Sentry.Integrations.Express({ app }),
        ],
        tracesSampleRate: 0.1,
        // Never send PII fields as tags
        beforeSend(event) {
            if (event.request?.data) {
                const data = event.request.data;
                for (const key of ['email', 'phone', 'password', 'address'])
                    delete data[key];
            }
            return event;
        },
    });
}
const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, '');
const parseAllowedOrigins = () => {
    const configuredOrigins = [
        process.env.FRONTEND_URL,
        process.env.CORS_ORIGINS,
        process.env.CORS_ORIGIN,
    ]
        .filter((value) => Boolean(value))
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
const isOriginAllowed = (origin) => {
    if (!origin) {
        return true;
    }
    return allowedOrigins.includes(normalizeOrigin(origin));
};
const corsOptions = {
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            callback(null, origin ? normalizeOrigin(origin) : true);
            return;
        }
        callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'baggage', 'sentry-trace'],
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
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
// Compact request logger: METHOD /path STATUS ms
morgan_1.default.token('status-color', (_req, res) => {
    const s = res.statusCode;
    if (s >= 500)
        return `\x1b[31m${s}\x1b[0m`; // red
    if (s >= 400)
        return `\x1b[33m${s}\x1b[0m`; // yellow
    return `\x1b[32m${s}\x1b[0m`; // green
});
const httpLogger = (0, morgan_1.default)(':method :url :status-color :response-time ms', {
    // Skip noisy Render health pings from the log entirely
    skip: (req) => req.url === '/health',
});
// Sentry request handler — must be the first middleware to capture full request context
app.use(Sentry.Handlers.requestHandler());
// Middleware
app.use((0, helmet_1.default)());
app.use((0, compression_1.default)());
app.use(httpLogger);
// SEO sitemap — before rate limiter so crawlers are not throttled
app.use(sitemap_1.default);
// Health check must be before rate limiter — Render pings every 5s and would exhaust the limit
app.get('/health', async (_req, res) => {
    try {
        const prisma = (0, database_1.getPrismaClient)();
        await prisma.$queryRaw `SELECT 1`;
        res.status(200).json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
    }
    catch {
        res.status(503).json({ status: 'degraded', db: 'disconnected', timestamp: new Date().toISOString() });
    }
});
// Explicit preflight handler
app.options('*', (0, cors_1.default)(corsOptions));
app.use(limiter);
app.use((0, cors_1.default)(corsOptions));
// Webhook route needs raw body for HMAC signature verification — must come before express.json()
app.use('/api/payments/webhook', express_1.default.raw({ type: '*/*' }));
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
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
app.use('/api', routes_1.default);
// Sentry error handler — must be before the custom error handler to capture unhandled exceptions
app.use(Sentry.Handlers.errorHandler());
// Error handling middleware (must be last)
app.use(errorHandler_1.errorHandler);
const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
// Graceful shutdown
const shutdown = async (signal) => {
    console.log(`${signal} received — shutting down gracefully`);
    server.close(async () => {
        await (0, database_1.disconnectPrisma)();
        console.log('Server shut down gracefully');
        process.exit(0);
    });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
//# sourceMappingURL=server.js.map