"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCheckoutToken = exports.createCheckoutToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const getSecret = () => {
    const secret = process.env.CHECKOUT_TOKEN_SECRET ||
        process.env.SUPABASE_JWT_SECRET ||
        process.env.CASHFREE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error('CHECKOUT_TOKEN_SECRET is not configured');
    }
    return secret;
};
const sign = (payload) => crypto_1.default.createHmac('sha256', getSecret()).update(payload).digest('base64url');
const createCheckoutToken = (orderId) => {
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const body = `${orderId}.${expiresAt}`;
    return `${body}.${sign(body)}`;
};
exports.createCheckoutToken = createCheckoutToken;
const verifyCheckoutToken = (token, orderId) => {
    if (!token || !orderId)
        return false;
    const parts = token.split('.');
    if (parts.length !== 3)
        return false;
    const [tokenOrderId, expiresAtRaw, signature] = parts;
    if (tokenOrderId !== orderId)
        return false;
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now())
        return false;
    const body = `${tokenOrderId}.${expiresAtRaw}`;
    const expected = sign(body);
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }
    catch {
        return false;
    }
};
exports.verifyCheckoutToken = verifyCheckoutToken;
//# sourceMappingURL=checkout-token.js.map