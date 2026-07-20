/**
 * Turns a display name into a URL slug.
 *
 * NOTE on Bangla: stripping to ASCII would reduce a name like "শাড়ি" to an
 * empty string, and every such product would then collide on the same slug.
 * Non-Latin scripts are therefore KEPT -- modern browsers and Postgres handle
 * them fine, and the URL is percent-encoded on the wire. Only characters that
 * are genuinely unsafe in a path segment are removed.
 */
export const slugify = (input: string): string => {
  const slug = input
    .normalize("NFKD")
    // Strip combining marks left behind by NFKD on Latin accents (é -> e),
    // but leave Bangla/Arabic/CJK code points intact.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    // Anything that is not a letter, number or dash becomes a dash. \p{L} and
    // \p{N} are Unicode-aware, so Bangla letters survive.
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug;
};

/**
 * Produces a slug that does not already exist.
 *
 * `exists` is injected rather than importing Prisma here, so the same helper
 * serves categories, brands and (later) products without this file knowing
 * about any of them.
 *
 * `excludeId` lets an update keep its own slug instead of colliding with itself.
 */
export const uniqueSlug = async (
  name: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> => {
  const base = slugify(name);

  // A name of only punctuation, or an empty one, would otherwise produce "".
  const seed = base.length > 0 ? base : `item-${Date.now().toString(36)}`;

  if (!(await exists(seed))) {
    return seed;
  }

  // Bounded rather than while(true): a runaway loop here would hang the request.
  for (let n = 2; n <= 50; n++) {
    const candidate = `${seed}-${n}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  // 50 collisions on one name is pathological; fall back to something certain.
  return `${seed}-${Date.now().toString(36)}`;
};
