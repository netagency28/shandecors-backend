"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAndPriceOrder = exports.calculateShippingFee = void 0;
const database_1 = __importDefault(require("./database"));
const FREE_SHIPPING_THRESHOLD = 999;
const STANDARD_SHIPPING_FEE = 99;
const MAX_QUANTITY_PER_LINE = 20;
const roundMoney = (value) => Math.round(value * 100) / 100;
const calculateShippingFee = (subtotal) => subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
exports.calculateShippingFee = calculateShippingFee;
const validateAndPriceOrder = async (rawItems) => {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error('Order must include at least one item');
    }
    const items = rawItems;
    const mergedLines = new Map();
    for (const line of items) {
        if (!line.product_id) {
            throw new Error('Each order line must include a product_id');
        }
        const quantity = Math.max(1, Math.floor(Number(line.quantity || 1)));
        if (!Number.isFinite(quantity) || quantity > MAX_QUANTITY_PER_LINE) {
            throw new Error('Invalid item quantity');
        }
        mergedLines.set(line.product_id, (mergedLines.get(line.product_id) || 0) + quantity);
    }
    const productIds = [...mergedLines.keys()];
    const prisma = (0, database_1.default)();
    const products = await prisma.product.findMany({
        where: {
            id: { in: productIds },
            isActive: true,
            deletedAt: null,
        },
        select: {
            id: true,
            name: true,
            price: true,
            comparePrice: true,
            stock: true,
            images: true,
        },
    });
    if (products.length !== productIds.length) {
        throw new Error('One or more products are unavailable');
    }
    const productById = new Map(products.map((product) => [product.id, product]));
    const pricedLines = [];
    for (const [productId, quantity] of mergedLines.entries()) {
        const product = productById.get(productId);
        if (!product) {
            throw new Error('One or more products are unavailable');
        }
        if (product.stock < quantity) {
            throw new Error(`${product.name} is out of stock or insufficient quantity available`);
        }
        const unitPrice = roundMoney(product.comparePrice != null && product.comparePrice < product.price
            ? product.comparePrice
            : product.price);
        const lineTotal = roundMoney(unitPrice * quantity);
        pricedLines.push({
            productId: product.id,
            quantity,
            unitPrice,
            lineTotal,
            productSnapshot: {
                product_name: product.name,
                product_image: product.images?.[0] || null,
            },
        });
    }
    const subtotal = roundMoney(pricedLines.reduce((sum, line) => sum + line.lineTotal, 0));
    const tax = 0;
    const shippingFee = (0, exports.calculateShippingFee)(subtotal);
    const total = roundMoney(subtotal + tax + shippingFee);
    return { subtotal, tax, shippingFee, total, items: pricedLines };
};
exports.validateAndPriceOrder = validateAndPriceOrder;
//# sourceMappingURL=order-pricing.js.map