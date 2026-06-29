import type { Prisma } from '@prisma/client';
/** Orders placed via Cash on Delivery — hidden from admin/customer lists and stats. */
export declare const isCodPaymentMethod: (paymentMethod: string | null | undefined) => boolean;
export declare const excludeCodOrdersWhere: Prisma.OrderWhereInput;
//# sourceMappingURL=order-filters.d.ts.map