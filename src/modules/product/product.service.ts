import { Prisma, Product, ProductStatus, Role } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { uniqueSlug } from "../../utils/slug";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import { deleteImage } from "../../lib/cloudinary";
import { notifyAdmins } from "../notification/notification.service";
import {
  CreateProductInput,
  ListManageQuery,
  ProductStatusInput,
  UpdateProductInput,
} from "./product.validation";

export interface Actor {
  id: string;
  role: Role;
}

const SORTABLE = ["createdAt", "name", "minPrice", "totalStock"] as const;

/**
 * Editing any of these on a live product sends it back for review.
 *
 * Price and stock are absent because they live on ProductVariant -- a seller
 * must be able to restock or reprice without waiting for an admin, which is the
 * whole reason the rule is field-scoped rather than "any edit".
 */
const REVIEW_TRIGGERING_FIELDS: readonly (keyof UpdateProductInput)[] = [
  "name",
  "slug",
  "shortDescription",
  "description",
  "categoryId",
  "brandId",
  "specifications",
  "videoUrl",
  "tags",
];

const slugExists = (excludeId?: string) => async (slug: string) => {
  const found = await prisma.product.findUnique({
    where: { slug },
    select: { id: true },
  });
  return found !== null && found.id !== excludeId;
};

const isSeller = (actor: Actor) => actor.role === Role.SELLER;

/** Resolves the Seller row for a SELLER actor, or null for staff. */
const resolveSellerId = async (actor: Actor): Promise<string | null> => {
  if (!isSeller(actor)) return null;

  const seller = await prisma.seller.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });

  if (!seller) {
    throw new ApiError(404, "No seller profile is linked to this account");
  }

  return seller.id;
};

/**
 * Loads a product the actor is allowed to touch.
 *
 * Scoped by sellerId for sellers, so one supplier can never read or edit
 * another's catalogue by guessing an id. 404 rather than 403 on a miss, so ids
 * cannot be probed for existence.
 */
export const findManageable = async (
  actor: Actor,
  id: string,
): Promise<Product> => {
  const sellerId = await resolveSellerId(actor);

  const product = await prisma.product.findFirst({
    where: { id, ...(sellerId && { sellerId }) },
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  return product;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const manageInclude = {
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
  seller: { select: { id: true, shopName: true, code: true } },
  images: { orderBy: { sortOrder: "asc" } },
  productOptions: {
    orderBy: { sortOrder: "asc" },
    include: { option: { include: { values: true } } },
  },
  _count: { select: { variants: true, images: true } },
} satisfies Prisma.ProductInclude;

export const listManageable = async (
  actor: Actor,
  query: ListManageQuery,
): Promise<Paginated<unknown>> => {
  const sellerId = await resolveSellerId(actor);

  const where: Prisma.ProductWhereInput = {
    // A seller's filter is forced, not merely defaulted: passing
    // ?sellerId=<someone else> must not widen what they can see.
    ...(sellerId ? { sellerId } : query.sellerId && { sellerId: query.sellerId }),
    ...(query.status && { status: query.status }),
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.brandId && { brandId: query.brandId }),
    ...(query.isFeatured !== undefined && { isFeatured: query.isFeatured }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { slug: { contains: query.search, mode: "insensitive" } },
        { variants: { some: { sku: { contains: query.search, mode: "insensitive" } } } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: manageInclude,
      orderBy: toPrismaOrderBy(query, SORTABLE, "createdAt"),
      ...toPrismaPaging(query),
    }),
    prisma.product.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getManageable = async (actor: Actor, id: string) => {
  await findManageable(actor, id);

  return prisma.product.findUnique({
    where: { id },
    include: {
      ...manageInclude,
      variants: {
        orderBy: { sortOrder: "asc" },
        include: {
          variantOptions: {
            include: { value: { include: { option: true } } },
          },
        },
      },
    },
  });
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const createProduct = async (
  actor: Actor,
  input: CreateProductInput,
): Promise<Product> => {
  const sellerId = await resolveSellerId(actor);

  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
    select: { id: true },
  });

  if (!category) {
    throw new ApiError(400, "Category not found");
  }

  if (input.brandId) {
    const brand = await prisma.brand.findUnique({
      where: { id: input.brandId },
      select: { id: true },
    });

    if (!brand) {
      throw new ApiError(400, "Brand not found");
    }
  }

  const slug = await uniqueSlug(input.slug ?? input.name, slugExists());

  const { sellerId: requestedSellerId, specifications, ...data } = input;

  const createData: Prisma.ProductUncheckedCreateInput = {
    ...data,
    slug,
    // A seller can only ever create for themselves; staff may assign.
    sellerId: sellerId ?? requestedSellerId ?? null,
    // Everything starts as a draft. Going live is a separate, deliberate step.
    status: ProductStatus.DRAFT,
    // Prisma will not accept a plain `null` for a nullable Json column -- it
    // needs DbNull to mean SQL NULL, since JSON has its own `null` literal.
    ...(specifications !== undefined && {
      specifications:
        specifications === null
          ? Prisma.DbNull
          : (specifications as Prisma.InputJsonValue),
    }),
  };

  return prisma.product.create({ data: createData });
};

export const updateProduct = async (
  actor: Actor,
  id: string,
  input: UpdateProductInput,
): Promise<Product> => {
  const current = await findManageable(actor, id);

  if (input.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!category) throw new ApiError(400, "Category not found");
  }

  if (input.brandId) {
    const brand = await prisma.brand.findUnique({
      where: { id: input.brandId },
      select: { id: true },
    });
    if (!brand) throw new ApiError(400, "Brand not found");
  }

  // Only a seller's content edits re-open review. An admin editing is the
  // approver, so their change is approved by definition.
  const touchedReviewable = REVIEW_TRIGGERING_FIELDS.some(
    (field) => input[field] !== undefined,
  );

  const shouldResubmit =
    isSeller(actor) &&
    touchedReviewable &&
    (current.status === ProductStatus.ACTIVE ||
      current.status === ProductStatus.OUT_OF_STOCK);

  const slug =
    input.slug !== undefined
      ? await uniqueSlug(input.slug, slugExists(id))
      : undefined;

  // isFeatured is a merchandising decision, not the supplier's.
  const { isFeatured, specifications, ...rest } = input;

  const updateData: Prisma.ProductUncheckedUpdateInput = {
    ...rest,
    ...(slug && { slug }),
    ...(!isSeller(actor) && isFeatured !== undefined && { isFeatured }),
    ...(specifications !== undefined && {
      specifications:
        specifications === null
          ? Prisma.DbNull
          : (specifications as Prisma.InputJsonValue),
    }),
    ...(shouldResubmit && {
      status: ProductStatus.PENDING_APPROVAL,
      approvedAt: null,
      approvedById: null,
      publishedAt: null,
    }),
  };

  return prisma.product.update({ where: { id }, data: updateData });
};

/** Seller submits a draft or rejected product for admin review. */
export const submitForReview = async (
  actor: Actor,
  id: string,
): Promise<Product> => {
  const product = await findManageable(actor, id);

  if (
    product.status !== ProductStatus.DRAFT &&
    product.status !== ProductStatus.REJECTED
  ) {
    throw new ApiError(
      400,
      `Only draft or rejected products can be submitted (this one is ${product.status})`,
    );
  }

  // A product with no sellable variant would go live with no price at all.
  const variantCount = await prisma.productVariant.count({
    where: { productId: id, isActive: true },
  });

  if (variantCount === 0) {
    throw new ApiError(
      400,
      "Add at least one active variant with a price before submitting",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        status: ProductStatus.PENDING_APPROVAL,
        rejectionReason: null,
      },
    });

    await notifyAdmins(tx, {
      type: "SELLER",
      title: "Product submitted for approval",
      message: `"${updated.name}" is waiting for a decision`,
      link: `/admin/products/${updated.id}/edit`,
    });

    return updated;
  });
};

/** Admin approve / reject / activate / deactivate. */
export const setStatus = async (
  actor: Actor,
  id: string,
  input: ProductStatusInput,
): Promise<Product> => {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, status: true, publishedAt: true },
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  if (input.status === ProductStatus.REJECTED && !input.rejectionReason) {
    // Without a reason the seller has no idea what to fix and will just
    // resubmit the same thing.
    throw new ApiError(400, "A rejection reason is required");
  }

  const goingLive = input.status === ProductStatus.ACTIVE;

  return prisma.product.update({
    where: { id },
    data: {
      status: input.status,
      rejectionReason:
        input.status === ProductStatus.REJECTED
          ? input.rejectionReason
          : null,
      ...(goingLive && {
        approvedAt: new Date(),
        approvedById: actor.id,
        // Set once: "newest" sorting should reflect the first publish, not the
        // most recent reactivation.
        publishedAt: product.publishedAt ?? new Date(),
      }),
    },
  });
};

export const deleteProduct = async (
  actor: Actor,
  id: string,
): Promise<void> => {
  await findManageable(actor, id);

  const orderedCount = await prisma.orderItem.count({
    where: { productId: id },
  });

  // OrderItem.productId is SetNull and every line snapshots title/sku/price, so
  // deleting is safe for history -- but it silently breaks "buy again" links,
  // so make it a deliberate choice rather than a surprise.
  if (orderedCount > 0) {
    throw new ApiError(
      409,
      `This product appears in ${orderedCount} past order line(s). Set it to INACTIVE instead of deleting.`,
    );
  }

  const images = await prisma.productImage.findMany({
    where: { productId: id },
    select: { publicId: true },
  });

  // Variants, images and options all cascade from Product.
  await prisma.product.delete({ where: { id } });

  for (const image of images) {
    if (image.publicId) await deleteImage(image.publicId);
  }
};
