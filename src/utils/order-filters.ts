import type { Prisma } from '@prisma/client';

/** Orders placed via Cash on Delivery — hidden from admin/customer lists and stats. */
export const isCodPaymentMethod = (paymentMethod: string | null | undefined): boolean =>
  String(paymentMethod || '').trim().toLowerCase() === 'cod';

export const excludeCodOrdersWhere: Prisma.OrderWhereInput = {
  NOT: {
    paymentMethod: { equals: 'cod', mode: 'insensitive' },
  },
};
