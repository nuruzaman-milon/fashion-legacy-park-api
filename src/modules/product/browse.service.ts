import { Prisma, ProductStatus, SellerStatus } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
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
const visibleWhere: Prisma.ProductWhereInput = {
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

export const browse = async (
  query: BrowseQuery,
): Promise<Paginated<unknown>> => {
  const where: Prisma.ProductWhereInput = {
    ...visibleWhere,
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.categorySlug && { category: { slug: query.categorySlug } }),
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

  return paginate(items, total, query);
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
    },
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  // Available, not raw stock: reserved units are held by carts mid-checkout and
  // are not purchasable. Exposing raw stock would oversell during a flash sale.
  const variants = product.variants.map(({ reservedStock, ...v }) => ({
    ...v,
    available: Math.max(0, v.stock - reservedStock),
    valueIds: v.variantOptions.map((vo) => vo.valueId),
    variantOptions: undefined,
  }));

  // Cheap and useful: lets the frontend grey out a colour with nothing in stock
  // without recomputing the combination map itself.
  const inStockValueIds = new Set(
    product.variants
      .filter((v) => v.stock - v.reservedStock > 0)
      .flatMap((v) => v.variantOptions.map((vo) => vo.valueId)),
  );

  return {
    ...product,
    variants,
    inStockValueIds: [...inStockValueIds],
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
