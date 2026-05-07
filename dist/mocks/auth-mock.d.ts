export declare const mockUsers: {
    id: string;
    email: string;
    password: string;
    name: string;
    role: string;
}[];
export declare const mockAuth: {
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
    }>;
    resetPasswordForEmail(email: string): Promise<{
        data: {};
        error: null;
    }>;
};
//# sourceMappingURL=auth-mock.d.ts.map