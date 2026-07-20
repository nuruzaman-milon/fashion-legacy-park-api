import { Brand, Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { deleteImage } from "../../lib/cloudinary";
import { uniqueSlug } from "../../utils/slug";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import {
  CreateBrandInput,
  ListBrandsQuery,
  UpdateBrandInput,
} from "./brand.validation";

const SORTABLE = ["sortOrder", "name", "createdAt"] as const;

const slugExists = (excludeId?: string) => async (slug: string) => {
  const found = await prisma.brand.findUnique({
    where: { slug },
    select: { id: true },
  });
  return found !== null && found.id !== excludeId;
};

// ---- public ---------------------------------------------------------------

export const listActiveBrands = (): Promise<Brand[]> =>
  prisma.brand.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

export const getBySlug = async (slug: string): Promise<Brand> => {
  const brand = await prisma.brand.findFirst({ where: { slug, isActive: true } });

  if (!brand) {
    throw new ApiError(404, "Brand not found");
  }

  return brand;
};

// ---- admin ----------------------------------------------------------------

export const listBrands = async (
  query: ListBrandsQuery,
): Promise<Paginated<Brand & { _count: { products: number } }>> => {
  const where: Prisma.BrandWhereInput = {
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { slug: { contains: query.search, mode: "insensitive" } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.brand.findMany({
      where,
      orderBy: toPrismaOrderBy(query, SORTABLE, "sortOrder"),
      include: { _count: { select: { products: true } } },
      ...toPrismaPaging(query),
    }),
    prisma.brand.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getById = async (id: string): Promise<Brand> => {
  const brand = await prisma.brand.findUnique({ where: { id } });

  if (!brand) {
    throw new ApiError(404, "Brand not found");
  }

  return brand;
};

export const createBrand = async (
  input: CreateBrandInput,
): Promise<Brand> => {
  const slug = await uniqueSlug(input.slug ?? input.name, slugExists());

  return prisma.brand.create({ data: { ...input, slug } });
};

export const updateBrand = async (
  id: string,
  input: UpdateBrandInput,
): Promise<Brand> => {
  const current = await getById(id);

  const slug =
    input.slug !== undefined
      ? await uniqueSlug(input.slug, slugExists(id))
      : undefined;

  const updated = await prisma.brand.update({
    where: { id },
    data: { ...input, ...(slug && { slug }) },
  });

  if (
    input.logo !== undefined &&
    input.logo !== current.logo &&
    current.logoPublicId
  ) {
    await deleteImage(current.logoPublicId);
  }

  return updated;
};

/**
 * Deleting a brand is allowed even when products reference it: the FK is
 * SetNull, so those products simply become unbranded rather than disappearing.
 * The count is returned so the admin sees what happened instead of discovering
 * it on the storefront.
 */
export const deleteBrand = async (id: string): Promise<number> => {
  const brand = await prisma.brand.findUnique({
    where: { id },
    select: {
      id: true,
      logoPublicId: true,
      _count: { select: { products: true } },
    },
  });

  if (!brand) {
    throw new ApiError(404, "Brand not found");
  }

  await prisma.brand.delete({ where: { id } });

  if (brand.logoPublicId) {
    await deleteImage(brand.logoPublicId);
  }

  return brand._count.products;
};
