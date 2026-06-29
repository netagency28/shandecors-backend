import type { Response } from 'express';
export declare const setAuthCookies: (res: Response, session: {
    access_token?: string | null;
    refresh_token?: string | null;
}) => void;
export declare const clearAuthCookies: (res: Response) => void;
export declare const getAccessTokenFromCookies: (cookies: Record<string, string | undefined>) => string | undefined;
export declare const getRefreshTokenFromCookies: (cookies: Record<string, string | undefined>) => string | undefined;
//# sourceMappingURL=auth-cookies.d.ts.map