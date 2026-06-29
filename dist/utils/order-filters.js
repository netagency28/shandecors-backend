"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.excludeCodOrdersWhere = exports.isCodPaymentMethod = void 0;
/** Orders placed via Cash on Delivery — hidden from admin/customer lists and stats. */
const isCodPaymentMethod = (paymentMethod) => String(paymentMethod || '').trim().toLowerCase() === 'cod';
exports.isCodPaymentMethod = isCodPaymentMethod;
exports.excludeCodOrdersWhere = {
    NOT: {
        paymentMethod: { equals: 'cod', mode: 'insensitive' },
    },
};
//# sourceMappingURL=order-filters.js.map