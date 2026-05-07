export declare const emailService: {
    sendPasswordResetEmail(email: string): Promise<{
        success: boolean;
        error: string;
    } | {
        success: boolean;
        error?: undefined;
    }>;
    sendOrderConfirmationEmail(email: string, orderNumber: string, total: number): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: import("resend").CreateEmailResponseSuccess | null;
        error?: undefined;
    }>;
};
//# sourceMappingURL=email-service.d.ts.map