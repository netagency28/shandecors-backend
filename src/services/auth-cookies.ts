import type { CookieOptions, Response } from 'express';

const ACCESS_COOKIE = 'sd_access_token';
const REFRESH_COOKIE = 'sd_refresh_token';

const isProduction = () => process.env.NODE_ENV === 'production';

const baseCookieOptions = (): Pick<CookieOptions, 'httpOnly' | 'secure' | 'sameSite' | 'path'> => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isProduction() ? 'none' : 'lax',
  path: '/',
});

export const setAuthCookies = (
  res: Response,
  session: { access_token?: string | null; refresh_token?: string | null },
) => {
  if (session.access_token) {
    res.cookie(ACCESS_COOKIE, session.access_token, {
      ...baseCookieOptions(),
      maxAge: 60 * 60 * 1000,
    });
  }

  if (session.refresh_token) {
    res.cookie(REFRESH_COOKIE, session.refresh_token, {
      ...baseCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
};

export const clearAuthCookies = (res: Response) => {
  const opts = baseCookieOptions();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
};

export const getAccessTokenFromCookies = (cookies: Record<string, string | undefined>) =>
  cookies[ACCESS_COOKIE];

export const getRefreshTokenFromCookies = (cookies: Record<string, string | undefined>) =>
  cookies[REFRESH_COOKIE];
