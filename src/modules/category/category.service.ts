import { Category, Prisma } from "@prisma/client";
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
  CreateCategoryInput,
  ListCategoriesQuery,
  ReorderInput,
  UpdateCategoryInput,
} from "./category.validation";

/**
 * Deepest allowed nesting: Clothing > Women > Saree.
 *
 * A cap keeps the nav renderable and bounds the ancestor walk below. Without
 * one, a mis-click in an admin UI can nest a tree far deeper than any storefront
 * can display.
 */
const MAX_DEPTH = 3;

const SORTABLE = ["sortOrder", "name", "createdAt"] as const;

const slugExists = (excludeId?: string) => async (slug: string) => {
  const found = await prisma.category.findUnique({
    where: { slug },
    select: { id: true },
  });
  return found !== null && found.id !== excludeId;
};

/**
 * Walks up from `parentId` to the root.
 *
 * Two things are impossible to express as a database constraint and are checked
 * here instead:
 *
 *  1. **Cycles.** Making A the child of its own descendant creates a loop that
 *     hangs every recursive breadcrumb or tree query -- a hard hang, not a slow
 *     one, because the walk never reaches a root.
 *  2. **Depth.** See MAX_DEPTH.
 */
const assertPlacementValid = async (
  parentId: string | null | undefined,
  selfId?: string,
): Promise<void> => {
  if (!parentId) return;

  if (parentId === selfId) {
    throw new ApiError(400, "A category cannot be its own parent");
  }

  let cursor: string | null = parentId;
  let depth = 1; // the parent itself

  while (cursor) {
    const node: { id: string; parentId: string | null } | null =
      await prisma.category.findUnique({
        where: { id: cursor },
        select: { id: true, parentId: true },
      });

    if (!node) {
      throw new ApiError(400, "Parent category not found");
    }

    // Reaching ourselves on the way up means the new parent sits below us.
    if (selfId && node.id === selfId) {
      throw new ApiError(
        400,
        "Cannot move a category under one of its own subcategories",
      );
    }

    depth++;

    if (depth > MAX_DEPTH) {
      throw new ApiError(
        400,
        `Categories can be nested at most ${MAX_DEPTH} levels deep`,
      );
    }

    cursor = node.parentId;
  }
};

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  image: string | null;
  sortOrder: number;
  children: CategoryNode[];
}

/**
 * Nested tree of active categories.
 *
 * Fetches the whole set and assembles in memory rather than issuing a recursive
 * CTE: a catalogue has hundreds of categories at most, and one indexed query
 * beats N round-trips per level.
 */
export const getTree = async (): Promise<CategoryNode[]> => {
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      image: true,
      sortOrder: true,
      parentId: true,
    },
  });

  const byId = new Map<string, CategoryNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [] });
  }

  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    // A child whose parent is inactive is skipped rather than promoted to root:
    // deactivating "Clothing" should hide "Saree" too, not surface it in the
    // top-level nav.
    if (row.parentId) {
      byId.get(row.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
};

export const getBySlug = async (slug: string): Promise<Category> => {
  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  return category;
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const listCategories = async (
  query: ListCategoriesQuery,
): Promise<Paginated<Category & { _count: { children: number; products: number } }>> => {
  const where: Prisma.CategoryWhereInput = {
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.rootOnly && { parentId: null }),
    ...(query.parentId && { parentId: query.parentId }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { slug: { contains: query.search, mode: "insensitive" } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      orderBy: toPrismaOrderBy(query, SORTABLE, "sortOrder"),
      include: { _count: { select: { children: true, products: true } } },
      ...toPrismaPaging(query),
    }),
    prisma.category.count({ where }),
  ]);

  return paginate(items, total, query);
};

export const getById = async (id: string): Promise<Category> => {
  const category = await prisma.category.findUnique({ where: { id } });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  return category;
};

export const createCategory = async (
  input: CreateCategoryInput,
): Promise<Category> => {
  await assertPlacementValid(input.parentId);

  const slug = input.slug
    ? await uniqueSlug(input.slug, slugExists())
    : await uniqueSlug(input.name, slugExists());

  return prisma.category.create({
    data: { ...input, slug },
  });
};

export const updateCategory = async (
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> => {
  const current = await getById(id);

  if (input.parentId !== undefined) {
    await assertPlacementValid(input.parentId, id);
  }

  const slug =
    input.slug !== undefined
      ? await uniqueSlug(input.slug, slugExists(id))
      : undefined;

  const updated = await prisma.category.update({
    where: { id },
    data: { ...input, ...(slug && { slug }) },
  });

  // Delete replaced images only after the row is committed -- doing it first
  // would destroy the old file if the update then failed.
  for (const field of ["icon", "image", "banner"] as const) {
    const publicIdField = `${field}PublicId` as const;
    const oldPublicId = current[publicIdField];
    const changed =
      input[field] !== undefined && input[field] !== current[field];

    if (changed && oldPublicId) {
      await deleteImage(oldPublicId);
    }
  }

  return updated;
};

export const deleteCategory = async (id: string): Promise<void> => {
  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      iconPublicId: true,
      imagePublicId: true,
      bannerPublicId: true,
      _count: { select: { children: true, products: true } },
    },
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  // Both FKs are Restrict, so the database would reject these anyway -- but the
  // raw constraint error names a constraint, not a cause. Check first so the
  // admin is told what to move.
  if (category._count.children > 0) {
    throw new ApiError(
      409,
      `This category has ${category._count.children} subcategor${
        category._count.children === 1 ? "y" : "ies"
      }. Move or delete them first.`,
    );
  }

  if (category._count.products > 0) {
    throw new ApiError(
      409,
      `This category has ${category._count.products} product(s). Move them to another category first.`,
    );
  }

  await prisma.category.delete({ where: { id } });

  for (const publicId of [
    category.iconPublicId,
    category.imagePublicId,
    category.bannerPublicId,
  ]) {
    if (publicId) await deleteImage(publicId);
  }
};

/** Bulk sortOrder update, so a drag-and-drop reorder is one request. */
export const reorderCategories = async (input: ReorderInput): Promise<void> => {
  await prisma.$transaction(
    input.items.map((item) =>
      prisma.category.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
};
