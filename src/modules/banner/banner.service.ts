import { Banner, Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { deleteImage } from "../../lib/cloudinary";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import {
  CreateBannerInput,
  ListBannersQuery,
  ReorderBannersInput,
  UpdateBannerInput,
} from "./banner.validation";

const SORTABLE = ["sortOrder", "title", "createdAt"] as const;

/** Json columns reject plain null -- clearing one needs the DbNull marker. */
const jsonInput = <T>(value: T | null | undefined) =>
  value === null ? Prisma.DbNull : value;

const supportingPublicIds = (value: Prisma.JsonValue | null): string[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) =>
    entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    typeof entry.publicId === "string"
      ? [entry.publicId]
      : [],
  );
};

// ---- public ---------------------------------------------------------------

export const listActiveBanners = (): Promise<Banner[]> =>
  prisma.banner.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

// ---- admin ----------------------------------------------------------------

export const listBanners = async (
  query: ListBannersQuery,
): Promise<Paginated<Banner>> => {
  const where: Prisma.BannerWhereInput = {
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.search && {
      title: { contains: query.search, mode: "insensitive" },
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.banner.findMany({
      where,
      orderBy: toPrismaOrderBy(query, SORTABLE, "sortOrder"),
      ...toPrismaPaging(query),
    }),
    prisma.banner.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getById = async (id: string): Promise<Banner> => {
  const banner = await prisma.banner.findUnique({ where: { id } });

  if (!banner) {
    throw new ApiError(404, "Banner not found");
  }

  return banner;
};

export const createBanner = (input: CreateBannerInput): Promise<Banner> =>
  prisma.banner.create({
    data: {
      ...input,
      supportingImages: jsonInput(input.supportingImages),
    },
  });

export const updateBanner = async (
  id: string,
  input: UpdateBannerInput,
): Promise<Banner> => {
  const current = await getById(id);

  const updated = await prisma.banner.update({
    where: { id },
    data: {
      ...input,
      supportingImages: jsonInput(input.supportingImages),
    },
  });

  // Delete replaced files only after the row is committed -- doing it first
  // would destroy the old image if the update then failed.
  const orphaned: (string | null)[] = [];

  if (
    input.desktopImageUrl !== undefined &&
    input.desktopImageUrl !== current.desktopImageUrl
  ) {
    orphaned.push(current.desktopImagePublicId);
  }

  if (
    input.mobileImageUrl !== undefined &&
    input.mobileImageUrl !== current.mobileImageUrl
  ) {
    orphaned.push(current.mobileImagePublicId);
  }

  if (input.supportingImages !== undefined) {
    const kept = new Set(
      (input.supportingImages ?? []).flatMap((image) =>
        image.publicId ? [image.publicId] : [],
      ),
    );

    for (const publicId of supportingPublicIds(current.supportingImages)) {
      if (!kept.has(publicId)) {
        orphaned.push(publicId);
      }
    }
  }

  for (const publicId of orphaned) {
    if (publicId) await deleteImage(publicId);
  }

  return updated;
};

export const deleteBanner = async (id: string): Promise<void> => {
  const banner = await getById(id);

  await prisma.banner.delete({ where: { id } });

  for (const publicId of [
    banner.desktopImagePublicId,
    banner.mobileImagePublicId,
    ...supportingPublicIds(banner.supportingImages),
  ]) {
    if (publicId) await deleteImage(publicId);
  }
};

/** Bulk sortOrder update, so a drag-and-drop reorder is one request. */
export const reorderBanners = async (
  input: ReorderBannersInput,
): Promise<void> => {
  await prisma.$transaction(
    input.items.map((item) =>
      prisma.banner.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
};
