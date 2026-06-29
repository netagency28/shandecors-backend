export type OrderLineInput = {
    product_id: string;
    quantity?: number;
};
export type PricedOrderLine = {
    productId: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    productSnapshot: {
        product_name: string;
        product_image: string | null;
    };
};
export type PricedOrder = {
    subtotal: number;
    tax: number;
    shippingFee: number;
    total: number;
    items: PricedOrderLine[];
};
export declare const calculateShippingFee: (subtotal: number) => 0 | 99;
export declare const validateAndPriceOrder: (rawItems: unknown) => Promise<PricedOrder>;
//# sourceMappingURL=order-pricing.d.ts.map