import { ProductImage, ProductStatus, Role } from "@prisma/client";
import { z } from "zod";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { deleteImage } from "../../lib/cloudinary";
import { Actor, findManageable } from "./product.service";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const idParam = z.object({ id: z.string().min(1) });

export const addImageSchema = z.object({
  params: idParam,
  body: z.object({
    url: z.url("A valid image URL is required"),
    publicId: z.string().min(1).nullable().optional(),
    alt: z.string().trim().max(150).nullable().optional(),
    // Scopes the image to a colour: selecting "Red" swaps the gallery. Tied to
    // the VALUE rather than the variant so a dress does not need the same red
    // photos duplicated across S, M, L and XL.
    optionValueId: z.string().min(1).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).default(0),
    isPrimary: z.boolean().default(false),
  }),
});

export const reorderImagesSchema = z.object({
  params: idParam,
  body: z.object({
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          sortOrder: z.coerce.number().int().min(0),
        }),
      )
      .min(1)
      .max(50),
  }),
});

export const imageIdSchema = z.object({ params: idParam });

export type AddImageInput = z.infer<typeof addImageSchema>["body"];
export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>["body"];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Adding or removing an image is a content change, so a seller doing it to a
 * live product sends it back for review. Reordering and changing the primary
 * are cosmetic and stay live -- otherwise a seller could not tidy their gallery
 * without taking the product off sale.
 */
const resubmitIfLive = async (actor: Actor, productId: string) => {
  if (actor.role !== Role.SELLER) return;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { status: true },
  });

  if (
    product?.status === ProductStatus.ACTIVE ||
    product?.status === ProductStatus.OUT_OF_STOCK
  ) {
    await prisma.product.update({
      where: { id: productId },
      data: {
        status: ProductStatus.PENDING_APPROVAL,
        approvedAt: null,
        approvedById: null,
        publishedAt: null,
      },
    });
  }
};

export const listImages = async (
  actor: Actor,
  productId: string,
): Promise<ProductImage[]> => {
  await findManageable(actor, productId);

  return prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
  });
};

export const addImage = async (
  actor: Actor,
  productId: string,
  input: AddImageInput,
): Promise<ProductImage> => {
  await findManageable(actor, productId);

  if (input.optionValueId) {
    const value = await prisma.optionValue.findUnique({
      where: { id: input.optionValueId },
      select: { optionId: true },
    });

    if (!value) {
      throw new ApiError(400, "Option value not found");
    }

    // The value must belong to an option this product actually uses, or the
    // gallery would key off a colour the product has no variants for.
    const attached = await prisma.productOption.findFirst({
      where: { productId, optionId: value.optionId },
      select: { id: true },
    });

    if (!attached) {
      throw new ApiError(
        400,
        "That option value belongs to an option this product does not use",
      );
    }
  }

  const existingCount = await prisma.productImage.count({
    where: { productId },
  });

  // The first image is always primary, so a listing always has a thumbnail.
  const shouldBePrimary = input.isPrimary || existingCount === 0;

  const image = await prisma.$transaction(async (tx) => {
    if (shouldBePrimary) {
      // A partial unique index allows one primary per product, so the old one
      // must be cleared in the same transaction or the insert is rejected.
      await tx.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return tx.productImage.create({
      data: { ...input, productId, isPrimary: shouldBePrimary },
    });
  });

  await resubmitIfLive(actor, productId);

  return image;
};

const findImage = async (actor: Actor, imageId: string) => {
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
  });

  if (!image) {
    throw new ApiError(404, "Image not found");
  }

  await findManageable(actor, image.productId);

  return image;
};

export const setPrimaryImage = async (
  actor: Actor,
  imageId: string,
): Promise<ProductImage> => {
  const image = await findImage(actor, imageId);

  // Cosmetic: does not re-open review.
  return prisma.$transaction(async (tx) => {
    await tx.productImage.updateMany({
      where: { productId: image.productId, isPrimary: true },
      data: { isPrimary: false },
    });

    return tx.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });
  });
};

export const reorderImages = async (
  actor: Actor,
  productId: string,
  input: ReorderImagesInput,
): Promise<void> => {
  await findManageable(actor, productId);

  const ids = input.items.map((i) => i.id);

  const owned = await prisma.productImage.count({
    where: { id: { in: ids }, productId },
  });

  if (owned !== ids.length) {
    throw new ApiError(400, "One or more images do not belong to this product");
  }

  await prisma.$transaction(
    input.items.map((item) =>
      prisma.productImage.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
};

export const deleteImage_ = async (
  actor: Actor,
  imageId: string,
): Promise<void> => {
  const image = await findImage(actor, imageId);

  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });

    // Deleting the primary would leave the listing with no thumbnail.
    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId: image.productId },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });

      if (next) {
        await tx.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  });

  if (image.publicId) {
    await deleteImage(image.publicId);
  }

  await resubmitIfLive(actor, image.productId);
};
