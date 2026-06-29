export type AdminOrderEventType = 'order_placed' | 'payment_confirmed' | 'payment_failed';
export type AdminOrderItemLine = {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
};
export type AdminOrderPayload = {
    event: AdminOrderEventType;
    orderId: string;
    orderNumber: string;
    orderStatus: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    subtotal: number;
    tax: number;
    shippingFee: number;
    total: number;
    paymentStatus: string;
    paymentMethod?: string;
    items: AdminOrderItemLine[];
    shippingAddress: Record<string, string>;
    billingAddress?: Record<string, string>;
    notes?: string;
    createdAt?: string;
    failureReason?: string;
};
export type AdminAlertPayload = {
    title: string;
    message: string;
    context?: Record<string, string | number | boolean | undefined>;
    severity?: 'warning' | 'error' | 'critical';
};
/**
 * Resolves who receives admin emails:
 * 1. Users with role ADMIN in the database (unless ADMIN_NOTIFY_DB_ADMINS=false)
 * 2. Extra addresses from ADMIN_NOTIFICATION_EMAIL (comma-separated)
 * 3. Default fallback if the list would otherwise be empty
 * Minus any address in ADMIN_NOTIFICATION_EXCLUDE (comma-separated)
 */
export declare const resolveAdminNotificationRecipients: () => Promise<string[]>;
type TelegramSendResult = {
    ok: boolean;
    configured: boolean;
    chatId?: string;
    error?: string;
    messageId?: number;
};
export declare const buildOrderAdminPayload: (order: {
    id: string;
    orderNumber: string;
    status?: string;
    subtotal?: unknown;
    tax?: unknown;
    shipping?: unknown;
    total: unknown;
    paymentMethod?: string | null;
    paymentStatus: string;
    shippingAddress?: unknown;
    billingAddress?: unknown;
    notes?: string | null;
    createdAt?: Date | string;
    user?: {
        name?: string | null;
        email?: string | null;
        phone?: string | null;
    } | null;
    items?: Array<{
        quantity: number;
        price: unknown;
        productSnapshot?: unknown;
    }>;
}, event: AdminOrderEventType, options?: {
    failureReason?: string;
}) => AdminOrderPayload;
export declare const notifyAdminOrderEvent: (payload: AdminOrderPayload) => Promise<void>;
export declare const notifyAdminAlert: (payload: AdminAlertPayload) => Promise<void>;
/** Fire-and-forget helper — never throws */
export declare const notifyAdminOrderEventSafe: (payload: AdminOrderPayload) => void;
export declare const notifyAdminAlertSafe: (payload: AdminAlertPayload) => void;
export type AdminNotificationTestResult = {
    timestamp: string;
    email: {
        ok: boolean;
        recipients: string[];
        error?: string;
    };
    telegram: TelegramSendResult;
};
/** Send a test admin notification — use from admin API or scripts/test-telegram.js */
export declare const testAdminNotifications: () => Promise<AdminNotificationTestResult>;
export {};
//# sourceMappingURL=admin-notifications.d.ts.map