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
export {};
//# sourceMappingURL=email.d.ts.map