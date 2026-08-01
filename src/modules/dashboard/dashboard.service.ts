import { OrderStatus, ProductStatus, Role } from "@prisma/client";
import prisma from "../../lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

/** Signed % change, one decimal; null when the previous window is empty. */
const pctDelta = (current: number, previous: number): number | null =>
  previous > 0
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null;

/**
 * The dashboard's one read: KPI windows (last 30 days vs the 30 before),
 * work queues (pending orders, low stock) and the latest orders. Cancelled
 * orders count as traffic in `orders30d` but never as revenue.
 */
export const getStats = async () => {
  const now = Date.now();
  const from30 = new Date(now - 30 * DAY);
  const from60 = new Date(now - 60 * DAY);

  const sold = { orderStatus: { not: OrderStatus.CANCELLED } };

  const [
    rev30,
    rev60,
    orders30,
    orders60,
    pendingOrders,
    activeProducts,
    draftProducts,
    customers,
    customers30,
    customers60,
    recentOrders,
    lowStockRaw,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { ...sold, createdAt: { gte: from30 } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { ...sold, createdAt: { gte: from60, lt: from30 } },
      _sum: { total: true },
    }),
    prisma.order.count({ where: { createdAt: { gte: from30 } } }),
    prisma.order.count({ where: { createdAt: { gte: from60, lt: from30 } } }),
    prisma.order.count({ where: { orderStatus: OrderStatus.PENDING } }),
    prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
    prisma.product.count({ where: { status: ProductStatus.DRAFT } }),
    prisma.user.count({ where: { role: Role.CUSTOMER } }),
    prisma.user.count({
      where: { role: Role.CUSTOMER, createdAt: { gte: from30 } },
    }),
    prisma.user.count({
      where: { role: Role.CUSTOMER, createdAt: { gte: from60, lt: from30 } },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        invoiceNo: true,
        total: true,
        orderStatus: true,
        createdAt: true,
        user: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    // `lowStockThreshold` is per-variant, and Prisma cannot compare two
    // columns in a where — pull the plausible band and filter here.
    prisma.productVariant.findMany({
      where: {
        isActive: true,
        stock: { lte: 10 },
        product: {
          status: {
            in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK],
          },
        },
      },
      orderBy: { stock: "asc" },
      take: 50,
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        lowStockThreshold: true,
        product: {
          select: {
            id: true,
            name: true,
            images: {
              where: { isPrimary: true },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    }),
  ]);

  const revenue30d = Number(rev30._sum.total ?? 0);
  const revenuePrev = Number(rev60._sum.total ?? 0);

  return {
    revenue30d: revenue30d.toFixed(2),
    revenueDeltaPct: pctDelta(revenue30d, revenuePrev),
    orders30d: orders30,
    ordersDeltaPct: pctDelta(orders30, orders60),
    pendingOrders,
    activeProducts,
    draftProducts,
    customers,
    newCustomers30d: customers30,
    customersDeltaPct: pctDelta(customers30, customers60),
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      invoiceNo: o.invoiceNo,
      customer: o.user.name,
      itemCount: o._count.items,
      total: o.total,
      orderStatus: o.orderStatus,
      createdAt: o.createdAt,
    })),
    lowStock: lowStockRaw
      .filter((v) => v.stock <= v.lowStockThreshold)
      .slice(0, 6)
      .map((v) => ({
        variantId: v.id,
        productId: v.product.id,
        product: v.product.name,
        variant: v.name,
        sku: v.sku,
        stock: v.stock,
        image: v.product.images[0]?.url ?? null,
      })),
  };
};
