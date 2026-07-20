import { Option, OptionDisplayType, OptionValue, Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { slugify, uniqueSlug } from "../../utils/slug";
import {
  paginate,
  Paginated,
  toPrismaOrderBy,
  toPrismaPaging,
} from "../../utils/pagination";
import {
  CreateOptionInput,
  CreateOptionValueInput,
  ListOptionsQuery,
  UpdateOptionInput,
  UpdateOptionValueInput,
} from "./option.validation";

const SORTABLE = ["sortOrder", "name", "createdAt"] as const;

const optionSlugExists = (excludeId?: string) => async (slug: string) => {
  const found = await prisma.option.findUnique({
    where: { slug },
    select: { id: true },
  });
  return found !== null && found.id !== excludeId;
};

// ---- public (also what sellers read when building a product) --------------

export const listActiveOptions = () =>
  prisma.option.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      values: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { value: "asc" }],
      },
    },
  });

// ---- admin ----------------------------------------------------------------

export const listOptions = async (
  query: ListOptionsQuery,
): Promise<Paginated<Option & { _count: { values: number } }>> => {
  const where: Prisma.OptionWhereInput = {
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.search && {
      name: { contains: query.search, mode: "insensitive" },
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.option.findMany({
      where,
      orderBy: toPrismaOrderBy(query, SORTABLE, "sortOrder"),
      include: { _count: { select: { values: true } } },
      ...toPrismaPaging(query),
    }),
    prisma.option.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getOption = async (id: string) => {
  const option = await prisma.option.findUnique({
    where: { id },
    include: {
      values: { orderBy: [{ sortOrder: "asc" }, { value: "asc" }] },
      _count: { select: { productOptions: true } },
    },
  });

  if (!option) {
    throw new ApiError(404, "Option not found");
  }

  return option;
};

export const createOption = async (
  input: CreateOptionInput,
): Promise<Option> => {
  const existing = await prisma.option.findUnique({
    where: { name: input.name },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(409, `An option named "${input.name}" already exists`);
  }

  const slug = await uniqueSlug(input.slug ?? input.name, optionSlugExists());

  return prisma.option.create({ data: { ...input, slug } });
};

export const updateOption = async (
  id: string,
  input: UpdateOptionInput,
): Promise<Option> => {
  await getOption(id);

  return prisma.option.update({ where: { id }, data: input });
};

/**
 * Blocked once the option is attached to any product.
 *
 * ProductOption.optionId is Restrict, so the database would refuse anyway --
 * but its error names a constraint rather than explaining that products are
 * using it.
 */
export const deleteOption = async (id: string): Promise<void> => {
  const option = await prisma.option.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { productOptions: true } } },
  });

  if (!option) {
    throw new ApiError(404, "Option not found");
  }

  if (option._count.productOptions > 0) {
    throw new ApiError(
      409,
      `"${option.name}" is used by ${option._count.productOptions} product(s). Deactivate it instead of deleting.`,
    );
  }

  await prisma.option.delete({ where: { id } });
};

// ---- values ---------------------------------------------------------------

export const createOptionValue = async (
  optionId: string,
  input: CreateOptionValueInput,
): Promise<OptionValue> => {
  const option = await prisma.option.findUnique({
    where: { id: optionId },
    select: { id: true, displayType: true },
  });

  if (!option) {
    throw new ApiError(404, "Option not found");
  }

  // A colour chip with no colour renders as an empty box the customer cannot
  // interpret, so require the hex up front rather than shipping a blank swatch.
  if (option.displayType === OptionDisplayType.SWATCH && !input.hexColor) {
    throw new ApiError(
      400,
      "A swatch option needs a hexColor for each of its values",
    );
  }

  const slug = slugify(input.slug ?? input.value) || `value-${Date.now().toString(36)}`;

  // Both (optionId, value) and (optionId, slug) are unique in the schema.
  const clash = await prisma.optionValue.findFirst({
    where: { optionId, OR: [{ value: input.value }, { slug }] },
    select: { id: true },
  });

  if (clash) {
    throw new ApiError(409, `"${input.value}" already exists for this option`);
  }

  return prisma.optionValue.create({
    data: { ...input, slug, optionId },
  });
};

export const updateOptionValue = async (
  id: string,
  input: UpdateOptionValueInput,
): Promise<OptionValue> => {
  const value = await prisma.optionValue.findUnique({
    where: { id },
    select: { id: true, optionId: true, option: { select: { displayType: true } } },
  });

  if (!value) {
    throw new ApiError(404, "Option value not found");
  }

  if (
    value.option.displayType === OptionDisplayType.SWATCH &&
    input.hexColor === null
  ) {
    throw new ApiError(400, "A swatch value cannot have its colour removed");
  }

  if (input.value) {
    const clash = await prisma.optionValue.findFirst({
      where: { optionId: value.optionId, value: input.value, id: { not: id } },
      select: { id: true },
    });

    if (clash) {
      throw new ApiError(409, `"${input.value}" already exists for this option`);
    }
  }

  return prisma.optionValue.update({ where: { id }, data: input });
};

/**
 * Blocked once any variant is built on this value.
 *
 * ProductVariantOption.valueId is Restrict: deleting "Red" while variants are
 * defined as Red/S and Red/L would leave those variants with no identity.
 */
export const deleteOptionValue = async (id: string): Promise<void> => {
  const value = await prisma.optionValue.findUnique({
    where: { id },
    select: {
      id: true,
      value: true,
      _count: { select: { variantOptions: true } },
    },
  });

  if (!value) {
    throw new ApiError(404, "Option value not found");
  }

  if (value._count.variantOptions > 0) {
    throw new ApiError(
      409,
      `"${value.value}" is used by ${value._count.variantOptions} variant(s). Deactivate it instead of deleting.`,
    );
  }

  await prisma.optionValue.delete({ where: { id } });
};
