import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ProductStatus,
  SellerStatus,
} from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { evaluateCoupon } from "../coupon/coupon.service";
import { flashDealsForVariants, toNum } from "../flash-sale/flash-pricing";
import { notifyAdmins } from "../notification/notification.service";
import { refreshProduct } from "../product/denormalize";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import {
  AdminListOrdersQuery,
  AdminUpdateStatusInput,
  ListMyOrdersQuery,
  PlaceOrderInput,
} from "./order.validation";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Division per storefront district slug; unknown districts stand for themselves. */
const DIVISION_OF: Record<string, string> = {
  dhaka: "Dhaka",
  gazipur: "Dhaka",
  narayanganj: "Dhaka",
  chattogram: "Chattogram",
  "coxs-bazar": "Chattogram",
  cumilla: "Chattogram",
  sylhet: "Sylhet",
  rajshahi: "Rajshahi",
  khulna: "Khulna",
  barishal: "Barishal",
  rangpur: "Rangpur",
  mymensingh: "Mymensingh",
};

/**
 * Money knobs from the Setting singleton, with the storefront's long-standing
 * defaults while the row (or a field) is unset — checkout must never fail
 * because nobody has opened a settings screen yet.
 */
const checkoutSettings = async () => {
  const s = await prisma.setting.findFirst();
  return {
    insideDhaka: s?.insideDhakaShippingCharge
      ? toNum(s.insideDhakaShippingCharge)
      : 80,
    outsideDhaka: s?.outsideDhakaShippingCharge
      ? toNum(s.outsideDhakaShippingCharge)
      : 130,
    freeShippingMin: s?.freeShippingMinimumAmount
      ? toNum(s.freeShippingMinimumAmount)
      : 2000,
    vatEnabled: s?.vatEnabled ?? false,
    vatRate: s?.vatRate ? toNum(s.vatRate) : 0,
  };
};

/**
 * Sequential invoice number (INV-000001), generated inside the caller's
 * transaction: `invoiceNo` is unique, so two concurrent checkouts collide
 * loudly instead of silently duplicating (same pattern as seller codes).
 */
const nextInvoiceNo = async (tx: Prisma.TransactionClient): Promise<string> => {
  const last = await tx.order.findFirst({
    orderBy: { invoiceNo: "desc" },
    select: { invoiceNo: true },
  });

  const lastNumber = last ? Number(last.invoiceNo.replace(/\D/g, "")) : 0;

  return `INV-${String(lastNumber + 1).padStart(6, "0")}`;
};

// ---------------------------------------------------------------------------
// Read shapes
// ---------------------------------------------------------------------------

const orderListSelect = {
  id: true,
  invoiceNo: true,
  orderStatus: true,
  paymentStatus: true,
  paymentMethod: true,
  subtotal: true,
  shippingCharge: true,
  tax: true,
  discount: true,
  couponCode: true,
  total: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      title: true,
      variantName: true,
      quantity: true,
      unitPrice: true,
      image: true,
      productId: true,
    },
  },
} satisfies Prisma.OrderSelect;

const orderDetailInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      productId: true,
      variantId: true,
      title: true,
      variantName: true,
      sku: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      image: true,
      product: { select: { slug: true } },
      // Lets the order page offer "rate this" exactly once per line.
      review: { select: { id: true, rating: true, status: true } },
    },
  },
  statusHistory: {
    where: { isPublic: true },
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderInclude;

// ---------------------------------------------------------------------------
// Place order
// ---------------------------------------------------------------------------

export const placeOrder = async (userId: string, input: PlaceOrderInput) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, phone: true },
  });

  // Provenance only — the snapshot below is what ships. Owner-scoped so a
  // guessed id cannot link someone else's address row.
  if (input.addressId) {
    const owned = await prisma.address.findFirst({
      where: { id: input.addressId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new ApiError(400, "That saved address no longer exists");
    }
  }

  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: {
      id: true,
      items: {
        select: {
          id: true,
          quantity: true,
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              stock: true,
              reservedStock: true,
              lowStockThreshold: true,
              isActive: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  status: true,
                  categoryId: true,
                  sellerId: true,
                  seller: {
                    select: { id: true, status: true, commissionRate: true },
                  },
                  images: {
                    where: { isPrimary: true },
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, "Your cart is empty");
  }

  // Same availability rules the cart shows — an order must not slip through
  // with a line the cart itself would flag.
  for (const item of cart.items) {
    const { variant } = item;
    const { product } = variant;
    const available = Math.max(0, variant.stock - variant.reservedStock);

    const unavailable =
      product.status !== ProductStatus.ACTIVE ||
      (product.sellerId && product.seller?.status !== SellerStatus.APPROVED) ||
      !variant.isActive ||
      available < item.quantity;

    if (unavailable) {
      throw new ApiError(
        409,
        `"${product.name}" is no longer available as selected — review your cart`,
      );
    }
  }

  // The authoritative price re-resolution the display layers defer to.
  const deals = await flashDealsForVariants(
    cart.items.map((i) => ({
      id: i.variant.id,
      productId: i.variant.product.id,
      categoryId: i.variant.product.categoryId,
      price: i.variant.price,
    })),
  );

  const lines = cart.items.map((item) => {
    const deal = deals.get(item.variant.id);
    const unitPrice = deal ? Number(deal.flashPrice) : toNum(item.variant.price);
    return {
      item,
      deal,
      unitPrice,
      totalPrice: round2(unitPrice * item.quantity),
    };
  });

  // A capped deal must cover the whole line — silently charging part of the
  // quantity at full price is a surprise on the invoice.
  for (const line of lines) {
    if (line.deal?.remaining != null && line.item.quantity > line.deal.remaining) {
      throw new ApiError(
        409,
        `Only ${line.deal.remaining} of "${line.item.variant.product.name}" ${
          line.deal.remaining === 1 ? "is" : "are"
        } left at the flash price — adjust the quantity`,
      );
    }
  }

  const settings = await checkoutSettings();

  const subtotal = round2(lines.reduce((sum, l) => sum + l.totalPrice, 0));

  // The same engine the checkout preview used — a code that previewed clean
  // can only fail here on a race (limit spent, window closed) since.
  const couponResult = input.couponCode
    ? await evaluateCoupon(
        userId,
        input.couponCode,
        lines.map((line) => ({
          productId: line.item.variant.product.id,
          categoryId: line.item.variant.product.categoryId,
          unitPrice: line.unitPrice,
          quantity: line.item.quantity,
          onFlashSale: Boolean(line.deal),
        })),
        subtotal,
      )
    : null;
  const discount = couponResult?.discount ?? 0;

  const districtSlug = input.district.toLowerCase();
  const baseShipping =
    subtotal >= settings.freeShippingMin
      ? 0
      : districtSlug === "dhaka"
        ? settings.insideDhaka
        : settings.outsideDhaka;
  // A FREE_SHIPPING coupon zeroes the charge itself (so every surface that
  // renders shippingCharge === 0 as "Free" just works); goods coupons ride
  // the discount column instead.
  const shippingCharge = couponResult?.freeShipping ? 0 : baseShipping;
  const taxRate = settings.vatEnabled ? settings.vatRate : 0;
  const tax = round2(((subtotal - discount) * taxRate) / 100);
  const total = round2(subtotal - discount + shippingCharge + tax);

  const order = await prisma.$transaction(async (tx) => {
    // Conditional decrement, not read-then-write (FEATURE.md hard rule): the
    // WHERE clause is what makes two last-unit checkouts serialize.
    for (const line of lines) {
      const hit = await tx.productVariant.updateMany({
        where: { id: line.item.variant.id, stock: { gte: line.item.quantity } },
        data: { stock: { decrement: line.item.quantity } },
      });

      if (hit.count === 0) {
        throw new ApiError(
          409,
          `"${line.item.variant.product.name}" just sold out — review your cart`,
        );
      }
    }

    // Claim capped flash units the same conditional way.
    for (const line of lines) {
      if (!line.deal) continue;

      const claimed = await tx.flashSaleItem.updateMany({
        where: {
          flashSaleId: line.deal.saleId,
          variantId: line.item.variant.id,
          ...(line.deal.quantityLimit !== null && {
            soldCount: { lte: line.deal.quantityLimit - line.item.quantity },
          }),
        },
        data: { soldCount: { increment: line.item.quantity } },
      });

      if (claimed.count === 0) {
        throw new ApiError(
          409,
          `The flash-price units of "${line.item.variant.product.name}" just sold out — review your cart`,
        );
      }
    }

    const invoiceNo = await nextInvoiceNo(tx);

    const created = await tx.order.create({
      data: {
        userId,
        email: user.email,
        phone: user.phone ?? input.phone,
        addressId: input.addressId,
        invoiceNo,
        shipReceiverName: input.receiverName,
        shipPhone: input.phone,
        shipDivision: DIVISION_OF[districtSlug] ?? input.district,
        shipDistrict: input.district,
        // The checkout form collects a free-text street address, not a
        // separate upazila — the district stands in so the NOT NULL column
        // stays truthful enough for courier handoff.
        shipUpazila: input.upazila ?? input.district,
        shipArea: input.area,
        shipAddress: input.address,
        shipPostalCode: input.postalCode,
        subtotal,
        shippingCharge,
        taxRate,
        tax,
        discount,
        total,
        ...(couponResult && {
          couponId: couponResult.coupon.id,
          couponCode: couponResult.coupon.code,
          couponDiscountType: couponResult.coupon.discountType,
          couponDiscountValue: couponResult.coupon.discountValue,
        }),
        paymentMethod: PaymentMethod.COD,
        note: input.note,
        items: {
          create: lines.map((line) => ({
            variantId: line.item.variant.id,
            productId: line.item.variant.product.id,
            sellerId: line.item.variant.product.sellerId,
            quantity: line.item.quantity,
            title: line.item.variant.product.name,
            variantName: line.item.variant.name,
            sku: line.item.variant.sku,
            unitPrice: line.unitPrice,
            totalPrice: line.totalPrice,
            image: line.item.variant.product.images[0]?.url ?? null,
          })),
        },
        statusHistory: {
          create: { fromStatus: null, toStatus: OrderStatus.PENDING },
        },
      },
      include: orderDetailInclude,
    });

    // Claim the coupon the same conditional way as stock: the WHERE clause
    // serializes two last-slot redemptions, and the DB CHECK
    // (usedCount <= totalUsageLimit) backs it up.
    if (couponResult) {
      const { coupon } = couponResult;

      const claimed = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          isActive: true,
          ...(coupon.totalUsageLimit !== null && {
            usedCount: { lt: coupon.totalUsageLimit },
          }),
        },
        data: { usedCount: { increment: 1 } },
      });

      if (claimed.count === 0) {
        throw new ApiError(
          409,
          `Coupon ${coupon.code} just ran out — remove it and place the order again`,
        );
      }

      // Recount inside the transaction — two parallel checkouts by the same
      // user both pass the advisory check in evaluateCoupon.
      const mine = await tx.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (mine >= coupon.perUserLimit) {
        throw new ApiError(
          409,
          `You have already used ${coupon.code} the maximum number of times`,
        );
      }

      await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId,
          orderId: created.id,
          // For FREE_SHIPPING the saving is the charge that was waived.
          discountAmount: couponResult.freeShipping ? baseShipping : discount,
        },
      });
    }

    // Seller settlement rows, written at order time (FEATURE.md rule 5); they
    // move to PAYABLE only after the return window, which the returns module
    // will own.
    const sellerItems = created.items.filter((i) => i.variantId !== null);
    for (const orderItem of sellerItems) {
      const line = lines.find((l) => l.item.variant.id === orderItem.variantId);
      const seller = line?.item.variant.product.seller;
      if (!line || !seller) continue;

      const commissionRate = toNum(seller.commissionRate);
      const gross = line.totalPrice;
      const commission = round2((gross * commissionRate) / 100);

      await tx.sellerLedger.create({
        data: {
          sellerId: seller.id,
          orderId: created.id,
          orderItemId: orderItem.id,
          grossAmount: gross,
          commissionRate,
          commissionAmount: commission,
          netPayable: round2(gross - commission),
        },
      });
    }

    // Keep the denormalised catalogue truthful in the same transaction.
    const productIds = [...new Set(lines.map((l) => l.item.variant.product.id))];
    for (const productId of productIds) {
      const sold = lines
        .filter((l) => l.item.variant.product.id === productId)
        .reduce((n, l) => n + l.item.quantity, 0);
      await tx.product.update({
        where: { id: productId },
        data: { soldCount: { increment: sold } },
      });
      await refreshProduct(productId, tx);
    }

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    await notifyAdmins(tx, {
      type: "ORDER",
      title: `New order ${invoiceNo}`,
      message: `${input.receiverName} · ${lines.length} ${
        lines.length === 1 ? "item" : "items"
      } · ৳${total.toFixed(0)} (COD)`,
      link: `/admin/orders/${created.id}`,
    });

    // Only threshold CROSSINGS notify — an already-low variant selling again
    // would otherwise ring the bell on every order.
    for (const line of lines) {
      const { variant } = line.item;
      const before = variant.stock;
      const after = before - line.item.quantity;
      if (before > variant.lowStockThreshold && after <= variant.lowStockThreshold) {
        await notifyAdmins(tx, {
          type: "SYSTEM",
          title: after === 0 ? "Out of stock" : "Low stock",
          message: `${variant.product.name} — ${variant.name} has ${after} left`,
          link: `/admin/products/${variant.product.id}/edit`,
        });
      }
    }

    return created;
    // Checkout deliberately does all its bookkeeping in one transaction
    // (stock, flash caps, coupon, ledger, notifications — FEATURE.md rules),
    // which outgrows Prisma's 5s default on a cold dev server.
  }, { timeout: 15000 });

  return order;
};

// ---------------------------------------------------------------------------
// Customer reads & cancel
// ---------------------------------------------------------------------------

export const listMyOrders = async (
  userId: string,
  query: ListMyOrdersQuery,
): Promise<Paginated<unknown>> => {
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: { userId },
      select: orderListSelect,
      orderBy: { createdAt: "desc" },
      ...toPrismaPaging(query),
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return paginate(items, total, query);
};

export const getMyOrder = async (userId: string, id: string) => {
  const order = await prisma.order.findFirst({
    where: { id, userId },
    include: orderDetailInclude,
  });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  return order;
};

/** Shared by customer cancel and admin cancel — restock plus bookkeeping. */
const cancelInTx = async (
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    orderStatus: OrderStatus;
    items: { variantId: string | null; productId: string | null; quantity: number }[];
  },
  actorId: string,
  reason: string | undefined,
) => {
  await tx.order.update({
    where: { id: order.id },
    data: {
      orderStatus: OrderStatus.CANCELLED,
      cancelReason: reason ?? null,
      cancelledById: actorId,
      cancelledAt: new Date(),
    },
  });

  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.orderStatus,
      toStatus: OrderStatus.CANCELLED,
      note: reason,
      changedById: actorId,
    },
  });

  // A cancelled order frees its coupon slot — the redemption ledger makes
  // the undo precise where a bare counter never could. (Nothing to farm
  // here: the cancelled order's discount dies with it.)
  const redemptions = await tx.couponRedemption.findMany({
    where: { orderId: order.id },
    select: { id: true, couponId: true },
  });
  for (const redemption of redemptions) {
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
    await tx.coupon.updateMany({
      where: { id: redemption.couponId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  }

  // Cancellable states are all pre-shipment, so the goods are still here —
  // put every unit back. Flash soldCount stays claimed on purpose: releasing
  // it would let order-and-cancel loops farm capped deals.
  const productIds = new Set<string>();
  for (const item of order.items) {
    if (item.variantId) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
    }
    if (item.productId) {
      productIds.add(item.productId);
      await tx.product.update({
        where: { id: item.productId },
        data: { soldCount: { decrement: item.quantity } },
      });
    }
  }
  for (const productId of productIds) {
    await refreshProduct(productId, tx);
  }
};

export const cancelMyOrder = async (
  userId: string,
  id: string,
  reason?: string,
) => {
  const order = await prisma.order.findFirst({
    where: { id, userId },
    select: {
      id: true,
      invoiceNo: true,
      orderStatus: true,
      items: { select: { variantId: true, productId: true, quantity: true } },
    },
  });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  // Once the parcel is moving, cancellation becomes a return, not an undo.
  if (
    order.orderStatus !== OrderStatus.PENDING &&
    order.orderStatus !== OrderStatus.CONFIRMED
  ) {
    throw new ApiError(
      400,
      "This order is already being processed and can no longer be cancelled",
    );
  }

  await prisma.$transaction(async (tx) => {
    await cancelInTx(tx, order, userId, reason);
    // Customer-initiated only — an admin cancelling from the panel needs no
    // bell about their own click.
    await notifyAdmins(tx, {
      type: "ORDER",
      title: `Order cancelled ${order.invoiceNo}`,
      message: reason ? `Customer's reason: ${reason}` : "Cancelled by the customer",
      link: `/admin/orders/${order.id}`,
    });
    // Restock + coupon release + notify outgrow the 5s default on a cold dev
    // server, same as placeOrder.
  }, { timeout: 15000 });

  return getMyOrder(userId, id);
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const ADMIN_SORTABLE = ["createdAt", "total", "invoiceNo"] as const;

export const adminListOrders = async (
  query: AdminListOrdersQuery,
): Promise<Paginated<unknown>> => {
  const where: Prisma.OrderWhereInput = {
    ...(query.orderStatus && { orderStatus: query.orderStatus }),
    ...(query.paymentStatus && { paymentStatus: query.paymentStatus }),
    ...(query.search && {
      OR: [
        { invoiceNo: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search } },
        { shipPhone: { contains: query.search } },
        { shipReceiverName: { contains: query.search, mode: "insensitive" } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      select: {
        ...orderListSelect,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
      },
      orderBy: toPrismaOrderBy(query, ADMIN_SORTABLE, "createdAt"),
      ...toPrismaPaging(query),
    }),
    prisma.order.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const adminGetOrder = async (id: string) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      ...orderDetailInclude,
      // Admins see the full timeline, internal notes included.
      statusHistory: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          isPublic: true,
          changedById: true,
          createdAt: true,
        },
      },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  return order;
};

/** Forward-only flow; cancel allowed anywhere before the parcel ships. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
  ],
  PROCESSING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
};

export const adminUpdateStatus = async (
  actorId: string,
  id: string,
  input: AdminUpdateStatusInput,
) => {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderStatus: true,
      paymentStatus: true,
      paymentMethod: true,
      total: true,
      items: { select: { variantId: true, productId: true, quantity: true } },
    },
  });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  if (!TRANSITIONS[order.orderStatus].includes(input.status)) {
    throw new ApiError(
      400,
      `A ${order.orderStatus.toLowerCase()} order cannot move to ${input.status.toLowerCase()}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (input.status === OrderStatus.CANCELLED) {
      await cancelInTx(tx, order, actorId, input.note);
      return;
    }

    const stamps: Prisma.OrderUpdateInput = {
      orderStatus: input.status,
      ...(input.status === OrderStatus.CONFIRMED && { confirmedAt: new Date() }),
      ...(input.status === OrderStatus.SHIPPED && { shippedAt: new Date() }),
      ...(input.status === OrderStatus.DELIVERED && { deliveredAt: new Date() }),
    };

    // COD settles on the doorstep: delivery IS the capture. The Payment row
    // is the ledger; paymentStatus is its cache, updated in the same
    // transaction (FEATURE.md rule 3).
    if (
      input.status === OrderStatus.DELIVERED &&
      order.paymentMethod === PaymentMethod.COD &&
      order.paymentStatus === PaymentStatus.PENDING
    ) {
      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: order.total,
          method: PaymentMethod.COD,
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });
      stamps.paymentStatus = PaymentStatus.PAID;
    }

    await tx.order.update({ where: { id: order.id }, data: stamps });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.orderStatus,
        toStatus: input.status,
        note: input.note,
        changedById: actorId,
      },
    });
    // The CANCELLED branch runs the full restock + coupon release, which
    // outgrows the 5s default on a cold dev server.
  }, { timeout: 15000 });

  return adminGetOrder(id);
};
