# Catalog API — Category, Brand, Options

Base URL: `http://localhost:5000/api/v1`

Foundation phase. Products and variants come next and depend on everything here
— a product needs a category, and its variants are built from the option
library below.

See also [`auth.md`](./auth.md) and [`admin.md`](./admin.md).

---

## Who can do what

| | Read | Write |
|---|---|---|
| Categories | **Public** | `SUPER_ADMIN`, `ADMIN` |
| Brands | **Public** | `SUPER_ADMIN`, `ADMIN` |
| Options & values | **Public** | `SUPER_ADMIN`, `ADMIN` |
| Image upload | — | `SUPER_ADMIN`, `ADMIN` |

**Sellers read, never write.** They pick from existing categories, brands and
options when creating a product. That is the entire point of a shared option
library: if fifty suppliers each typed their own "Red", store-wide colour
filtering would never work.

Public and admin routes are **separate paths**, not one route that returns more
rows to some callers — public endpoints show only active records, admin
endpoints show everything.

---

## Categories

### `GET /categories/tree` — public

Nested tree of **active** categories, for the storefront nav.

```json
{
  "success": true,
  "message": "Category tree fetched",
  "data": [
    {
      "id": "cmrt...",
      "name": "Clothing",
      "slug": "clothing",
      "icon": null,
      "image": null,
      "sortOrder": 1,
      "children": [
        { "id": "cmrt...", "name": "Women", "slug": "women", "children": [
          { "id": "cmrt...", "name": "Saree", "slug": "saree", "children": [] }
        ]}
      ]
    }
  ]
}
```

> Deactivating a category hides its **whole branch**. Setting "Women" inactive
> removes "Saree" from the tree too, rather than promoting it to the top level.

### `GET /categories/:slug` — public

Single active category. `404` if missing or inactive.

### `GET /admin/categories`

Paginated, all categories including inactive. Query: `page`, `limit`, `sortBy`
(`sortOrder` · `name` · `createdAt`), `sortOrder`, `search`, `isActive`,
`parentId`, `rootOnly`.

Each row includes `_count: { children, products }`.

### `POST /admin/categories`

```json
{
  "name": "Clothing",
  "slug": "clothing",
  "description": "All apparel",
  "parentId": null,
  "sortOrder": 1,
  "isActive": true,
  "icon": "https://res.cloudinary.com/.../icon.png",
  "iconPublicId": "categories/abc123",
  "image": "https://res.cloudinary.com/.../image.jpg",
  "imagePublicId": "categories/def456",
  "banner": null,
  "bannerPublicId": null,
  "metaTitle": "Clothing | Aydin Bazar",
  "metaDescription": "...",
  "metaKeywords": "clothing, fashion"
}
```

Only `name` is required.

**Slug is generated from the name when omitted**, and de-duplicated
automatically — a second "Clothing" becomes `clothing-2`.

**Bangla names work.** `শাড়ি` produces a Bangla slug rather than an empty
string. Stripping to ASCII would leave nothing, and every Bangla-named category
would then collide on the same empty slug.

### `PATCH /admin/categories/:id`

Same fields, all optional. Replacing an image deletes the previous file from
Cloudinary — which is why the `*PublicId` values must be sent alongside the URLs.

**Rejected with `400`:**

| Attempt | Why |
|---|---|
| `parentId` = its own id | A category cannot be its own parent |
| Moving a category under its own descendant | Creates a cycle. Every recursive breadcrumb or tree query would then loop forever — a hard hang, not a slow query. **No database constraint can express this**, so it is checked in the service |
| Nesting more than 3 levels | Keeps the nav renderable and bounds the ancestor walk |
| Unknown `parentId` | |

### `PATCH /admin/categories/reorder`

```json
{ "items": [
  { "id": "cmrt...", "sortOrder": 1 },
  { "id": "cmrt...", "sortOrder": 2 }
]}
```

One request for a whole drag-and-drop reorder, applied in a transaction.

### `DELETE /admin/categories/:id`

**`409` when the category still has subcategories or products**, with a message
naming the count. Both foreign keys are `Restrict`, so the database would refuse
anyway — the check exists so the admin is told *what to move* instead of seeing
a raw constraint name.

---

## Brands

### `GET /brands` — public

Active brands, ordered by `sortOrder` then name.

### `GET /brands/:slug` — public

### `GET /admin/brands`

Paginated, with `_count: { products }`. Query: `page`, `limit`, `sortBy`,
`sortOrder`, `search`, `isActive`.

### `POST /admin/brands`

```json
{
  "name": "Aarong",
  "slug": "aarong",
  "description": "Local heritage brand",
  "logo": "https://res.cloudinary.com/.../logo.png",
  "logoPublicId": "brands/abc123",
  "sortOrder": 1,
  "isActive": true,
  "metaTitle": "Aarong",
  "metaDescription": "...",
  "metaKeywords": "aarong"
}
```

Only `name` is required. Slug behaves as for categories.

### `PATCH /admin/brands/:id` · `DELETE /admin/brands/:id`

**Deleting a brand succeeds even when products use it.** `Product.brandId` is
`SetNull`, so those products become unbranded rather than disappearing. The
response reports how many were affected:

```json
{ "success": true, "message": "Brand deleted. 12 product(s) are now unbranded." }
```

This is the deliberate difference from categories, where deletion is blocked:
a product without a brand is still sellable, a product without a category is not.

---

## Option library

Global and reusable. `Color` and `Red` are defined **once** and shared by every
product.

```
Option "Color"  (displayType: SWATCH)
  ├── OptionValue "Red"   #FF0000   sortOrder 1
  └── OptionValue "Blue"  #0000FF   sortOrder 2

Option "Size"   (displayType: BUTTON)
  ├── "S" (1) · "M" (2) · "L" (3) · "XL" (4)

Option "Weight" (displayType: DROPDOWN)
  └── "250gm" · "500gm" · "1kg"
```

`displayType` tells the frontend how to render: `SWATCH` (colour chips),
`BUTTON` (size pills), `DROPDOWN`.

### `GET /options` — public

Active options with their active values, ready for the filter sidebar and the
product-builder pickers.

```json
{
  "data": [
    {
      "id": "cmrt...",
      "name": "Size",
      "slug": "size",
      "displayType": "BUTTON",
      "sortOrder": 2,
      "values": [
        { "id": "...", "value": "S",  "slug": "s",  "hexColor": null, "sortOrder": 1 },
        { "id": "...", "value": "M",  "slug": "m",  "hexColor": null, "sortOrder": 2 },
        { "id": "...", "value": "L",  "slug": "l",  "hexColor": null, "sortOrder": 3 },
        { "id": "...", "value": "XL", "slug": "xl", "hexColor": null, "sortOrder": 4 }
      ]
    }
  ]
}
```

> **`sortOrder` is why sizes render `S, M, L, XL`** instead of sorting
> alphabetically to `L, M, S, XL`. Set it when creating values.

### `GET /admin/options` · `GET /admin/options/:id`

The single-option view includes all values (active and not) and
`_count: { productOptions }` — how many products use it.

### `POST /admin/options`

```json
{ "name": "Color", "displayType": "SWATCH", "sortOrder": 1, "isActive": true }
```

`409` if an option with that name already exists — names are unique so the
library cannot fragment into "Color" and "Colour".

### `PATCH /admin/options/:id` · `DELETE /admin/options/:id`

**`409` when any product uses the option.** Deactivate instead — `isActive:
false` hides it from the storefront while leaving existing products intact.

### `POST /admin/options/:id/values`

```json
{ "value": "Red", "hexColor": "#FF0000", "sortOrder": 1, "isActive": true }
```

**`hexColor` is required when the parent option is a `SWATCH`** and must be a
6-digit hex (`#FF0000`). A colour chip with no colour renders as an empty box
the customer cannot interpret.

`409` if the value already exists under that option.

### `PATCH /admin/option-values/:id` · `DELETE /admin/option-values/:id`

Values are addressed by their own id, not nested under the option.

- `400` when removing `hexColor` from a value belonging to a `SWATCH` option.
- **`409` when variants are built on the value.** Deleting "Red" while variants
  exist as Red/S and Red/L would leave those variants with no identity.

---

## Image upload

### `POST /admin/uploads/image` — multipart, field name `image`

```bash
curl -X POST "$API/admin/uploads/image" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "image=@./banner.jpg" \
  -F "folder=categories"
```

```json
{
  "success": true,
  "message": "Image uploaded",
  "data": {
    "url": "https://res.cloudinary.com/.../categories/abc123.jpg",
    "publicId": "categories/abc123",
    "width": 1200, "height": 400, "bytes": 84213
  }
}
```

Max 2 MB, `image/*` only. `folder` accepts lowercase letters and dashes;
anything else falls back to `misc`.

**Then send both values** to the entity endpoint — `icon` + `iconPublicId`,
`logo` + `logoPublicId`, and so on. The public_id is what makes deleting the
replaced file possible; a URL alone cannot address the asset for deletion.

Returns `503` unless `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and
`CLOUDINARY_API_SECRET` are all set. Everything else works without them.

> **Known gap:** uploading an image and then abandoning the form leaves an
> orphaned file. Entity deletes and replacements clean up correctly; only
> never-referenced uploads accumulate. A periodic sweep can handle it if it ever
> matters.

---

## Suggested seeding order

Products need all three, so set them up first:

1. **Categories** — build the tree top-down, parents before children.
2. **Brands** — optional per product.
3. **Options** — `Color` (SWATCH), `Size` (BUTTON), `Weight` (DROPDOWN), then
   their values with explicit `sortOrder`.

```bash
API=http://localhost:5000/api/v1
TOKEN=<admin access token>

CLOTHING=$(curl -s -X POST $API/admin/categories \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Clothing","sortOrder":1}' | jq -r .data.id)

curl -s -X POST $API/admin/categories \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"Women\",\"parentId\":\"$CLOTHING\",\"sortOrder\":1}"

COLOR=$(curl -s -X POST $API/admin/options \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Color","displayType":"SWATCH","sortOrder":1}' | jq -r .data.id)

curl -s -X POST $API/admin/options/$COLOR/values \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"Red","hexColor":"#FF0000","sortOrder":1}'
```

---

## Next phase — products and variants

Decided but not yet built:

- **Variants are auto-generated as a matrix.** Pick `Color = [Red, Blue]` and
  `Size = [S, M, L]` and the API creates all six variants with generated SKUs,
  then price and stock are edited in bulk.
- **Editing an approved product:** `price`, `stock` and `isActive` stay live
  immediately; changing `name`, `description`, `images`, `category` or `brand`
  returns the product to `PENDING_APPROVAL`.
- **Denormalised `Product` fields** (`minPrice`, `maxPrice`, `totalStock`,
  `soldCount`, `avgRating`, `reviewCount`) are maintained by application code.
  They must be recalculated on every write that affects them, from one shared
  service rather than scattered through controllers — otherwise listings
  silently go stale.
