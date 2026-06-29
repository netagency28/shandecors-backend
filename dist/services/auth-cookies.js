"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRefreshTokenFromCookies = exports.getAccessTokenFromCookies = exports.clearAuthCookies = exports.setAuthCookies = void 0;
const ACCESS_COOKIE = 'sd_access_token';
const REFRESH_COOKIE = 'sd_refresh_token';
const isProduction = () => process.env.NODE_ENV === 'production';
const baseCookieOptions = () => ({
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    path: '/',
});
const setAuthCookies = (res, session) => {
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
exports.setAuthCookies = setAuthCookies;
const clearAuthCookies = (res) => {
    const opts = baseCookieOptions();
    res.clearCookie(ACCESS_COOKIE, opts);
    res.clearCookie(REFRESH_COOKIE, opts);
};
exports.clearAuthCookies = clearAuthCookies;
const getAccessTokenFromCookies = (cookies) => cookies[ACCESS_COOKIE];
exports.getAccessTokenFromCookies = getAccessTokenFromCookies;
const getRefreshTokenFromCookies = (cookies) => cookies[REFRESH_COOKIE];
exports.getRefreshTokenFromCookies = getRefreshTokenFromCookies;
//# sourceMappingURL=auth-cookies.js.map