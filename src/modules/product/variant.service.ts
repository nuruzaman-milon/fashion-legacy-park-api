import { Prisma, ProductVariant } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { slugify } from "../../utils/slug";
import { refreshProduct } from "./denormalize";
import { Actor, findManageable } from "./product.service";
import {
  AttachOptionsInput,
  BulkUpdateInput,
  CreateVariantInput,
  GenerateVariantsInput,
  UpdateVariantInput,
} from "./variant.validation";

// ---------------------------------------------------------------------------
// Product options
// ---------------------------------------------------------------------------

/**
 * Declares which options this product uses, and in what order they render
 * (Colour row above Size row).
 *
 * Replaces the whole set rather than merging: an option cannot be removed while
 * variants are built on it, so a merge would silently leave stale rows behind.
 */
export const attachOptions = async (
  actor: Actor,
  productId: string,
  input: AttachOptionsInput,
) => {
  await findManageable(actor, productId);

  const optionIds = input.options.map((o) => o.optionId);

  if (new Set(optionIds).size !== optionIds.length) {
    throw new ApiError(400, "The same option was listed twice");
  }

  const found = await prisma.option.findMany({
    where: { id: { in: optionIds }, isActive: true },
    select: { id: true },
  });

  if (found.length !== optionIds.length) {
    throw new ApiError(400, "One or more options do not exist or are inactive");
  }

  const existingVariants = await prisma.productVariant.count({
    where: { productId },
  });

  if (existingVariants > 0) {
    throw new ApiError(
      409,
      "This product already has variants. Delete them before changing its options.",
    );
  }

  await prisma.$transaction([
    prisma.productOption.deleteMany({ where: { productId } }),
    prisma.productOption.createMany({
      data: input.options.map((o) => ({
        productId,
        optionId: o.optionId,
        sortOrder: o.sortOrder,
      })),
    }),
  ]);

  return prisma.productOption.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    include: { option: { include: { values: true } } },
  });
};

// ---------------------------------------------------------------------------
// Variant matrix
// ---------------------------------------------------------------------------

/** Cartesian product: [[Red,Blue],[S,M,L]] -> 6 ordered combinations. */
const cartesian = <T>(groups: T[][]): T[][] =>
  groups.reduce<T[][]>(
    (acc, group) => acc.flatMap((combo) => group.map((item) => [...combo, item])),
    [[]],
  );

// A three-dimension matrix explodes fast; this is a guard against an admin
// accidentally creating thousands of rows in one call.
const MAX_VARIANTS = 200;

/**
 * Builds every combination of the selected option values.
 *
 * Existing combinations are skipped rather than duplicated, so calling this
 * again after adding a new colour tops up the matrix instead of failing on the
 * (productId, name) unique constraint.
 */
export const generateVariants = async (
  actor: Actor,
  productId: string,
  input: GenerateVariantsInput,
) => {
  await findManageable(actor, productId);

  const attached = await prisma.productOption.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    select: { optionId: true },
  });

  if (attached.length === 0) {
    throw new ApiError(
      400,
      "Attach options to this product before generating variants",
    );
  }

  const attachedIds = new Set(attached.map((a) => a.optionId));

  for (const selection of input.selections) {
    if (!attachedIds.has(selection.optionId)) {
      throw new ApiError(
        400,
        "A selected option is not attached to this product",
      );
    }
  }

  // Order the selections to match the product's option order, so the generated
  // display name reads "Red / L" rather than "L / Red".
  const ordered = attached
    .map((a) => input.selections.find((s) => s.optionId === a.optionId))
    .filter((s): s is GenerateVariantsInput["selections"][number] => Boolean(s));

  const valueIds = ordered.flatMap((s) => s.valueIds);

  const values = await prisma.optionValue.findMany({
    where: { id: { in: valueIds } },
    select: { id: true, value: true, optionId: true, sortOrder: true },
  });

  if (values.length !== new Set(valueIds).size) {
    throw new ApiError(400, "One or more option values do not exist");
  }

  const valueById = new Map(values.map((v) => [v.id, v]));

  for (const selection of ordered) {
    for (const id of selection.valueIds) {
      if (valueById.get(id)!.optionId !== selection.optionId) {
        throw new ApiError(
          400,
          "An option value does not belong to the option it was listed under",
        );
      }
    }
  }

  const groups = ordered.map((s) =>
    [...s.valueIds].sort(
      (a, b) => valueById.get(a)!.sortOrder - valueById.get(b)!.sortOrder,
    ),
  );

  const combinations = cartesian(groups);

  if (combinations.length > MAX_VARIANTS) {
    throw new ApiError(
      400,
      `That would create ${combinations.length} variants; the limit is ${MAX_VARIANTS}`,
    );
  }

  const existing = await prisma.productVariant.findMany({
    where: { productId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((v) => v.name));

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true },
  });

  // Derived from the product name when the caller does not supply one. The
  // fallback matters for Bangla names, where slugify keeps non-Latin characters
  // that .toUpperCase() leaves unchanged and would make a confusing SKU.
  const derived = slugify(product!.name)
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 10)
    .toUpperCase();

  const prefix = input.skuPrefix ?? (derived || "SKU");

  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const combo of combinations) {
      const name = combo.map((id) => valueById.get(id)!.value).join(" / ");

      if (existingNames.has(name)) continue;

      const skuSuffix = combo
        .map((id) => slugify(valueById.get(id)!.value).replace(/-/g, "").toUpperCase())
        .join("-");

      // SKU is globally unique, so two products with a "Red / S" would clash on
      // prefix alone. The product id fragment keeps them apart.
      const sku = `${prefix}-${skuSuffix}-${productId.slice(-4).toUpperCase()}`;

      await tx.productVariant.create({
        data: {
          productId,
          name,
          sku,
          price: new Prisma.Decimal(input.price),
          stock: input.stock,
          sortOrder: created,
          // The first variant created becomes the default, so listings always
          // have a price to show.
          isDefault: existingNames.size === 0 && created === 0,
          variantOptions: {
            create: combo.map((valueId) => ({ valueId })),
          },
        },
      });

      created++;
    }

    await refreshProduct(productId, tx);
  });

  return {
    created,
    skipped: combinations.length - created,
    total: combinations.length,
  };
};

export const listVariants = async (actor: Actor, productId: string) => {
  await findManageable(actor, productId);

  return prisma.productVariant.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    include: {
      variantOptions: { include: { value: { include: { option: true } } } },
    },
  });
};

export const createVariant = async (
  actor: Actor,
  productId: string,
  input: CreateVariantInput,
): Promise<ProductVariant> => {
  await findManageable(actor, productId);

  const values = await prisma.optionValue.findMany({
    where: { id: { in: input.valueIds } },
    select: { id: true, value: true, optionId: true },
  });

  if (values.length !== input.valueIds.length) {
    throw new ApiError(400, "One or more option values do not exist");
  }

  const name = values.map((v) => v.value).join(" / ");

  const clash = await prisma.productVariant.findFirst({
    where: { productId, name },
    select: { id: true },
  });

  if (clash) {
    throw new ApiError(409, `A "${name}" variant already exists`);
  }

  const { valueIds, sku, ...rest } = input;

  const variant = await prisma.$transaction(async (tx) => {
    const created = await tx.productVariant.create({
      data: {
        ...rest,
        productId,
        name,
        sku: sku ?? `${productId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        variantOptions: { create: valueIds.map((valueId) => ({ valueId })) },
      },
    });

    await refreshProduct(productId, tx);

    return created;
  });

  return variant;
};

const findVariant = async (actor: Actor, variantId: string) => {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, productId: true, isDefault: true },
  });

  if (!variant) {
    throw new ApiError(404, "Variant not found");
  }

  // Ownership flows through the product, so a seller cannot reach another
  // supplier's variant by id.
  await findManageable(actor, variant.productId);

  return variant;
};

export const updateVariant = async (
  actor: Actor,
  variantId: string,
  input: UpdateVariantInput,
): Promise<ProductVariant> => {
  const variant = await findVariant(actor, variantId);

  return prisma.$transaction(async (tx) => {
    // Only one default per product is enforced by a partial unique index, so
    // the old one must be cleared in the same transaction or the write fails.
    if (input.isDefault === true) {
      await tx.productVariant.updateMany({
        where: { productId: variant.productId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await tx.productVariant.update({
      where: { id: variantId },
      data: input,
    });

    // Price, stock and isActive all feed the denormalised product columns.
    await refreshProduct(variant.productId, tx);

    return updated;
  });
};

/** Bulk price/stock edit across the generated matrix. */
export const bulkUpdateVariants = async (
  actor: Actor,
  productId: string,
  input: BulkUpdateInput,
): Promise<number> => {
  await findManageable(actor, productId);

  const ids = input.variants.map((v) => v.id);

  const owned = await prisma.productVariant.count({
    where: { id: { in: ids }, productId },
  });

  // Reject the whole batch rather than silently applying the valid subset: a
  // partial bulk edit is very hard to notice in an admin grid.
  if (owned !== ids.length) {
    throw new ApiError(400, "One or more variants do not belong to this product");
  }

  await prisma.$transaction(async (tx) => {
    for (const { id, ...data } of input.variants) {
      await tx.productVariant.update({ where: { id }, data });
    }

    await refreshProduct(productId, tx);
  });

  return input.variants.length;
};

export const deleteVariant = async (
  actor: Actor,
  variantId: string,
): Promise<void> => {
  const variant = await findVariant(actor, variantId);

  const orderedCount = await prisma.orderItem.count({
    where: { variantId },
  });

  if (orderedCount > 0) {
    throw new ApiError(
      409,
      `This variant appears in ${orderedCount} past order line(s). Deactivate it instead of deleting.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.productVariant.delete({ where: { id: variantId } });

    // Deleting the default would leave the product with no price to display.
    if (variant.isDefault) {
      const next = await tx.productVariant.findFirst({
        where: { productId: variant.productId },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });

      if (next) {
        await tx.productVariant.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    await refreshProduct(variant.productId, tx);
  });
};
