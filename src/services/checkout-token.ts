import crypto from 'crypto';

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const getSecret = () => {
  const secret =
    process.env.CHECKOUT_TOKEN_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.CASHFREE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('CHECKOUT_TOKEN_SECRET is not configured');
  }
  return secret;
};

const sign = (payload: string) =>
  crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

export const createCheckoutToken = (orderId: string) => {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const body = `${orderId}.${expiresAt}`;
  return `${body}.${sign(body)}`;
};

export const verifyCheckoutToken = (token: string, orderId: string): boolean => {
  if (!token || !orderId) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [tokenOrderId, expiresAtRaw, signature] = parts;
  if (tokenOrderId !== orderId) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const body = `${tokenOrderId}.${expiresAtRaw}`;
  const expected = sign(body);

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};
