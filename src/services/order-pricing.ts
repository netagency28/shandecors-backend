import getPrismaClient from './database';

const FREE_SHIPPING_THRESHOLD = 999;
const STANDARD_SHIPPING_FEE = 99;
const MAX_QUANTITY_PER_LINE = 20;

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

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const calculateShippingFee = (subtotal: number) =>
  subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;

export const validateAndPriceOrder = async (
  rawItems: unknown,
): Promise<PricedOrder> => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Order must include at least one item');
  }

  const items = rawItems as OrderLineInput[];
  const mergedLines = new Map<string, number>();

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

  const prisma = getPrismaClient();
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
  const pricedLines: PricedOrderLine[] = [];

  for (const [productId, quantity] of mergedLines.entries()) {
    const product = productById.get(productId);
    if (!product) {
      throw new Error('One or more products are unavailable');
    }

    if (product.stock < quantity) {
      throw new Error(`${product.name} is out of stock or insufficient quantity available`);
    }

    const unitPrice = roundMoney(
      product.comparePrice != null && product.comparePrice < product.price
        ? product.comparePrice
        : product.price,
    );
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
  const shippingFee = calculateShippingFee(subtotal);
  const total = roundMoney(subtotal + tax + shippingFee);

  return { subtotal, tax, shippingFee, total, items: pricedLines };
};
