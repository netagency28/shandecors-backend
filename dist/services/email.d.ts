type OrderEmailPayload = {
    orderNumber: string;
    orderId: string;
    customerName: string;
    customerEmail: string;
    total: number;
    status: string;
};
export declare const sendOrderPlacedEmail: (payload: OrderEmailPayload) => Promise<void>;
export declare const sendOrderStatusEmail: (payload: Omit<OrderEmailPayload, "status"> & {
    oldStatus?: string;
    newStatus: string;
}) => Promise<void>;
export declare const sendPaymentFailedEmail: (payload: Omit<OrderEmailPayload, "status"> & {
    failureReason?: string;
}) => Promise<void>;
export declare const sendSignupConfirmationEmail: (email: string, name: string | undefined, confirmUrl: string) => Promise<void>;
export declare const sendPasswordResetEmail: (email: string, resetUrl: string) => Promise<void>;
export declare const sendContactAcknowledgementEmail: (name: string, email: string) => Promise<void>;
export {};
//# sourceMappingURL=email.d.ts.map