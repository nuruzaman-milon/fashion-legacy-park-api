import { Prisma, ProductStatus, SellerStatus } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { flashDealsForVariants } from "../flash-sale/flash-pricing";
import { paginate, Paginated, toPrismaPaging } from "../../utils/pagination";
import { BrowseQuery } from "./product.validation";

/**
 * What the storefront is allowed to show.
 *
 * OUT_OF_STOCK is included on purpose: a sold-out product should still have a
 * page (for SEO and "notify me"), it just cannot be bought. DRAFT,
 * PENDING_APPROVAL, REJECTED and INACTIVE never appear.
 *
 * The seller filter is the load-bearing part -- suspending a supplier has to
 * pull their catalogue immediately, and doing it here means every storefront
 * query inherits that without each caller remembering.
 */
export const visibleWhere: Prisma.ProductWhereInput = {
  status: { in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK] },
  OR: [
    { sellerId: null }, // first-party listing
    { seller: { status: SellerStatus.APPROVED } },
  ],
};

const listCard = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  minPrice: true,
  maxPrice: true,
  totalStock: true,
  avgRating: true,
  reviewCount: true,
  soldCount: true,
  isFeatured: true,
  status: true,
  publishedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
  images: {
    where: { isPrimary: true },
    take: 1,
    select: { url: true, alt: true },
  },
  // The default variant's comparePrice drives the strikethrough price on
  // cards. A partial unique index guarantees at most one default per product;
  // flattened to a top-level `comparePrice` in browse() below.
  variants: {
    where: { isDefault: true },
    take: 1,
    select: { comparePrice: true },
  },
} satisfies Prisma.ProductSelect;

const orderFor = (sort: BrowseQuery["sort"]): Prisma.ProductOrderByWithRelationInput[] => {
  switch (sort) {
    case "price-asc":
      return [{ minPrice: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ minPrice: "desc" }, { id: "asc" }];
    case "rating":
      return [{ avgRating: "desc" }, { reviewCount: "desc" }, { id: "asc" }];
    case "best-selling":
      return [{ soldCount: "desc" }, { id: "asc" }];
    default:
      // publishedAt, not createdAt: a product drafted months ago but published
      // today is new to customers.
      return [{ publishedAt: "desc" }, { id: "asc" }];
  }
};

/**
 * Products hang off leaf categories, but nav links point at ancestors --
 * nothing is ever assigned directly to "Women". A category filter therefore
 * matches the whole subtree, not just direct assignment, or every megamenu
 * link would land on an empty page.
 *
 * One small query and an in-memory walk, same reasoning as the category tree
 * endpoint. The visited set guards against a corrupted parent cycle turning
 * the walk into a hang.
 */
const subtreeIds = async (
  where: Prisma.CategoryWhereUniqueInput,
): Promise<string[]> => {
  const root = await prisma.category.findUnique({
    where,
    select: { id: true },
  });

  // Unknown category -> empty IN-list -> zero products, which is what the old
  // exact-match filter returned too.
  if (!root) return [];

  const rows = await prisma.category.findMany({
    select: { id: true, parentId: true },
  });

  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const siblings = childrenOf.get(row.parentId) ?? [];
    siblings.push(row.id);
    childrenOf.set(row.parentId, siblings);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const queue = [root.id];

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }

  return ids;
};

export const browse = async (
  query: BrowseQuery,
): Promise<Paginated<unknown>> => {
  // Both filters may arrive together; they AND like the old exact matches did.
  let categoryIds: string[] | undefined;

  if (query.categoryId) {
    categoryIds = await subtreeIds({ id: query.categoryId });
  }

  if (query.categorySlug) {
    const bySlug = await subtreeIds({ slug: query.categorySlug });
    categoryIds = categoryIds
      ? categoryIds.filter((id) => bySlug.includes(id))
      : bySlug;
  }

  const where: Prisma.ProductWhereInput = {
    ...visibleWhere,
    ...(categoryIds && { categoryId: { in: categoryIds } }),
    ...(query.brandId && { brandId: query.brandId }),
    ...(query.brandSlug && { brand: { slug: query.brandSlug } }),
    ...(query.tag && { tags: { has: query.tag } }),
    ...(query.isFeatured !== undefined && { isFeatured: query.isFeatured }),
    ...(query.inStock && { totalStock: { gt: 0 } }),
    // Range is applied to minPrice, the "from" price shown on the card, so the
    // filter matches what the customer actually sees.
    ...((query.minPrice !== undefined || query.maxPrice !== undefined) && {
      minPrice: {
        ...(query.minPrice !== undefined && { gte: query.minPrice }),
        ...(query.maxPrice !== undefined && { lte: query.maxPrice }),
      },
    }),
    // Faceted filter. Multiple values AND together across dimensions -- "Red"
    // and "L" must both match the SAME variant, otherwise a product that has a
    // red XL and a blue L would wrongly appear under Red + L.
    ...(query.optionValueIds?.length && {
      AND: query.optionValueIds.map((valueId) => ({
        variants: {
          some: { isActive: true, variantOptions: { some: { valueId } } },
        },
      })),
    }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { shortDescription: { contains: query.search, mode: "insensitive" } },
        { tags: { has: query.search.toLowerCase() } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: listCard,
      orderBy: orderFor(query.sort),
      ...toPrismaPaging(query),
    }),
    prisma.product.count({ where }),
  ]);

  const cards = items.map(({ variants, ...item }) => ({
    ...item,
    comparePrice: variants[0]?.comparePrice ?? null,
  }));

  return paginate(cards, total, query);
};

/**
 * Product detail page. Returns everything the variant picker needs: the option
 * rows in render order, their values, and which combination each variant is.
 */
export const getBySlug = async (slug: string) => {
  const product = await prisma.product.findFirst({
    where: { slug, ...visibleWhere },
    select: {
      id: true,
      name: true,
      slug: true,
      shortDescription: true,
      description: true,
      videoUrl: true,
      specifications: true,
      tags: true,
      minPrice: true,
      maxPrice: true,
      totalStock: true,
      avgRating: true,
      reviewCount: true,
      soldCount: true,
      isFeatured: true,
      status: true,
      metaTitle: true,
      metaDescription: true,
      metaKeywords: true,
      publishedAt: true,
      category: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true, slug: true } },
      images: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          url: true,
          alt: true,
          isPrimary: true,
          optionValueId: true,
        },
      },
      productOptions: {
        orderBy: { sortOrder: "asc" },
        select: {
          sortOrder: true,
          option: {
            select: {
              id: true,
              name: true,
              slug: true,
              displayType: true,
              values: {
                where: { isActive: true },
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  value: true,
                  slug: true,
                  hexColor: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          comparePrice: true,
          stock: true,
          reservedStock: true,
          weight: true,
          isDefault: true,
          variantOptions: { select: { valueId: true } },
        },
      },
      // The latest published reviews ride along with the page — moderation
      // (ReviewStatus) is the only gate between a customer's words and here.
      reviews: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          rating: true,
          comment: true,
          isVerifiedPurchase: true,
          adminReply: true,
          helpfulCount: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  // The live sale's price for each variant -- the detail page must agree
  // with the homepage sale section, not show the shelf price next to it.
  const deals = await flashDealsForVariants(
    product.variants.map((v) => ({
      id: v.id,
      productId: product.id,
      categoryId: product.category.id,
      price: v.price,
    })),
  );

  // Available, not raw stock: reserved units are held by carts mid-checkout and
  // are not purchasable. Exposing raw stock would oversell during a flash sale.
  const variants = product.variants.map(({ reservedStock, ...v }) => {
    const deal = deals.get(v.id);
    return {
      ...v,
      available: Math.max(0, v.stock - reservedStock),
      valueIds: v.variantOptions.map((vo) => vo.valueId),
      variantOptions: undefined,
      // null when the variant isn't in the live sale (or its cap sold out).
      flash: deal
        ? {
            price: deal.flashPrice,
            quantityLimit: deal.quantityLimit,
            soldCount: deal.soldCount,
            remaining: deal.remaining,
          }
        : null,
    };
  });

  const anyDeal = deals.values().next().value;

  // Cheap and useful: lets the frontend grey out a colour with nothing in stock
  // without recomputing the combination map itself.
  const inStockValueIds = new Set(
    product.variants
      .filter((v) => v.stock - v.reservedStock > 0)
      .flatMap((v) => v.variantOptions.map((vo) => vo.valueId)),
  );

  // The option relation carries the option's whole value library ("Size" owns
  // S…XL and 150ml/250ml alike). The picker must only offer what THIS
  // product's variants are actually built from — an unused value is noise,
  // not an out-of-stock state.
  const usedValueIds = new Set(
    product.variants.flatMap((v) => v.variantOptions.map((vo) => vo.valueId)),
  );
  const productOptions = product.productOptions.map((po) => ({
    ...po,
    option: {
      ...po.option,
      values: po.option.values.filter((value) => usedValueIds.has(value.id)),
    },
  }));

  return {
    ...product,
    productOptions,
    variants,
    inStockValueIds: [...inStockValueIds],
    flashSale: anyDeal
      ? { id: anyDeal.saleId, title: anyDeal.title, endsAt: anyDeal.endsAt }
      : null,
  };
};

/** Increments the view counter without blocking the response. */
export const recordView = (productId: string): void => {
  prisma.product
    .update({ where: { id: productId }, data: { viewCount: { increment: 1 } } })
    .catch(() => {
      // A lost view count must never fail the page load.
    });
};
