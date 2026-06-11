export declare const getSupabaseClient: () => import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const getSupabaseAdminClient: () => import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any> | null;
export declare const authService: {
    signIn(email: string, password: string): Promise<{
        user: {
            id: string;
            email: string;
            user_metadata: {
                name: string;
            };
        };
        session: {
            access_token: string;
            refresh_token: string;
            user: {
                id: string;
                email: string;
                user_metadata: {
                    name: string;
                };
            };
        };
    } | {
        user: import("@supabase/supabase-js").AuthUser;
        session: import("@supabase/supabase-js").AuthSession;
        weakPassword?: import("@supabase/supabase-js").WeakPassword;
    }>;
    signUp(email: string, password: string, name?: string): Promise<{
        user: {
            id: string;
            email: string;
            user_metadata: {
                name: string;
            };
        };
        session: {
            access_token: string;
            refresh_token: string;
            user: {
                id: string;
                email: string;
                user_metadata: {
                    name: string;
                };
            };
        };
    } | {
        user: import("@supabase/supabase-js").AuthUser;
        session: null;
    }>;
    resetPasswordForEmail(email: string): Promise<{
        data: null;
        error: null;
    }>;
    signOut(accessToken: string): Promise<{
        error: import("@supabase/supabase-js").AuthError | null;
    }>;
};
//# sourceMappingURL=auth-service.d.ts.map