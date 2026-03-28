"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const errorHandler_1 = require("./middleware/errorHandler");
const routes_1 = __importDefault(require("./routes"));
// Load environment variables
dotenv_1.default.config();
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
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
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
        'https://shandecors.vercel.app',
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
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
};
console.log('🔧 CORS Configuration:', {
    allowedOrigins,
    credentials: corsOptions.credentials,
    methods: corsOptions.methods,
});
const io = new socket_io_1.Server(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    },
});
exports.io = io;
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
// Middleware
app.use((0, helmet_1.default)());
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined'));
// Explicit preflight handler
app.options('*', (0, cors_1.default)(corsOptions));
app.use(limiter);
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
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
app.use('/api', routes_1.default);
// Socket.IO connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});
// Error handling middleware (must be last)
app.use(errorHandler_1.errorHandler);
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
//# sourceMappingURL=server.js.map