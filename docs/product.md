# Product API — Products, Variants, Images

Base URL: `http://localhost:5000/api/v1`

Depends on [`catalog.md`](./catalog.md) — a product needs a category, and its
variants are built from the global option library.

---

## The three surfaces

| Path | Who | What they see |
|---|---|---|
| `/products` | **Public** | Only live products from approved sellers |
| `/seller/products` | `SELLER` | **Only their own** catalogue |
| `/admin/products` | `ADMIN`, `SUPER_ADMIN` | Everything, plus approve/reject |

`/seller/products` and `/admin/products` run **the same router**. The service
takes the caller as an actor and scopes every query by `sellerId` when that
caller is a `SELLER`. Two separate route files would mean every future change
has to be made twice — and the one that gets forgotten is the security hole.

---

## Lifecycle

```
     seller creates                 seller submits            admin approves
DRAFT ──────────────► DRAFT ──────────────────► PENDING_APPROVAL ──────────► ACTIVE
                        ▲                              │                       │
                        │      admin rejects           │                       │
                        └──────── REJECTED ◄───────────┘                       │
                                                                               │
                        seller edits name/description/images/category          │
                        ◄──────────────────────────────────────────────────────┘
```

| Status | On the storefront | Meaning |
|---|---|---|
| `DRAFT` | ❌ | Being built |
| `PENDING_APPROVAL` | ❌ | Waiting for an admin |
| `ACTIVE` | ✅ | Live and buyable |
| `OUT_OF_STOCK` | ✅ | Page visible, cannot be bought. Set **automatically** |
| `INACTIVE` | ❌ | Taken down by an admin |
| `REJECTED` | ❌ | Sent back with `rejectionReason` |

**Sellers cannot set `ACTIVE`.** They call `POST /:id/submit`; only an admin's
`PATCH /admin/products/:id/status` publishes.

### Edit-after-approval

The rule you chose, enforced in `product.service.ts`:

| Change | Result |
|---|---|
| Variant `price`, `stock`, `isActive` | **Stays live.** A supplier must be able to restock without waiting for an admin |
| Image reorder, set primary | **Stays live** — cosmetic |
| `name`, `slug`, `description`, `shortDescription`, `categoryId`, `brandId`, `specifications`, `videoUrl`, `tags` | → `PENDING_APPROVAL` |
| Adding or deleting an image | → `PENDING_APPROVAL` |
| **An admin** editing any of the above | **Stays live** — the admin *is* the approver |

`OUT_OF_STOCK` is toggled automatically by the denormalisation service when
total stock hits zero and back to `ACTIVE` when it returns. It never touches a
`DRAFT`, `PENDING_APPROVAL` or `REJECTED` product — restocking must not publish
something that was never approved.

---

## Building a product, end to end

```bash
API=http://localhost:5000/api/v1
T=<seller access token>

# 1. Create — always starts as DRAFT
P=$(curl -s -X POST $API/seller/products -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" \
  -d '{"name":"Kurti","categoryId":"<cat>","brandId":"<brand>","tags":["eid"]}' \
  | jq -r .data.id)

# 2. Declare which options it uses, in render order
curl -s -X POST $API/seller/products/$P/options -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" \
  -d '{"options":[{"optionId":"<color>","sortOrder":1},
                  {"optionId":"<size>","sortOrder":2}]}'

# 3. Generate the matrix — Colour x Size in one call
curl -s -X POST $API/seller/products/$P/variants/generate \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"selections":[
        {"optionId":"<color>","valueIds":["<red>","<blue>"]},
        {"optionId":"<size>","valueIds":["<s>","<m>","<l>"]}],
       "price":1200,"stock":5,"skuPrefix":"KURTI"}'
# → 6 variants: Red / S, Red / M, Red / L, Blue / S, Blue / M, Blue / L

# 4. Set real prices and stock in bulk
curl -s -X PATCH $API/seller/products/$P/variants/bulk \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"variants":[{"id":"<v1>","price":1200,"stock":10},
                   {"id":"<v2>","price":1250,"stock":4}]}'

# 5. Images — upload first, then attach both url and publicId
curl -s -X POST $API/uploads/image -H "Authorization: Bearer $T" \
  -F "image=@./red.jpg" -F "folder=products"
curl -s -X POST $API/seller/products/$P/images -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" \
  -d '{"url":"<url>","publicId":"<publicId>","optionValueId":"<red>"}'

# 6. Submit for review
curl -s -X POST $API/seller/products/$P/submit -H "Authorization: Bearer $T"
```

---

## Variant matrix

`POST /:id/variants/generate`

```json
{
  "selections": [
    { "optionId": "<color>", "valueIds": ["<red>", "<blue>"] },
    { "optionId": "<size>",  "valueIds": ["<s>", "<m>", "<l>"] }
  ],
  "price": 1200,
  "stock": 5,
  "skuPrefix": "KURTI"
}
```

```json
{ "success": true, "message": "6 variant(s) created, 0 already existed",
  "data": { "created": 6, "skipped": 0, "total": 6 } }
```

Behaviours worth knowing:

- **Names follow the product's option order**, not the order you send them —
  `"Red / S"`, never `"S / Red"`. Values within a dimension follow their
  `sortOrder`, so sizes come out `S, M, L` rather than alphabetically.
- **Re-running tops up instead of failing.** Add a new colour and call it again;
  existing combinations are skipped, reported as `skipped`.
- **SKUs include a product-id fragment** (`KURTI-RED-S-4F2A`). `sku` is globally
  unique, so two products both having a "Red / S" would otherwise collide.
- **The first variant becomes the default**, so a listing always has a price.
- Max 3 options and 200 generated variants per call.
- **Options cannot be changed once variants exist** (`409`). Delete the variants
  first — otherwise variants would reference a dimension the product no longer
  has.

### Individual variants

`POST /:id/variants` · `PATCH /catalog/variants/:id` ·
`DELETE /catalog/variants/:id`

- Setting `isDefault` clears the previous default **in the same transaction** —
  a partial unique index allows only one per product, so a separate write fails.
- Deleting the default promotes the next variant.
- **`409` when the variant appears in past orders.** Deactivate instead;
  deleting would break the order line's link even though the price and title are
  snapshotted.

---

## Denormalised fields

`Product.minPrice`, `maxPrice`, `totalStock`, `avgRating`, `reviewCount` are
**maintained by application code**, in `src/modules/product/denormalize.ts`.

They exist because price and stock live on `ProductVariant` and ratings live on
`Review` — aggregating per request would make price-range filters and
rating/best-seller sorts unindexable.

> ⚠️ **Every write that touches a variant's price, stock or `isActive`, or a
> review's status, must call `refreshProduct()`.** It is one function on purpose.
> Scattering the arithmetic through controllers is how listings silently go
> stale: one forgotten call and a product shows the wrong price on the category
> page indefinitely, with nothing failing and no error to notice.

Only **active** variants count toward price and stock, and only **approved**
reviews count toward the rating — an unmoderated 1-star review must not move the
public average before anyone has seen it.

---

## Images

`GET|POST /:id/images` · `PATCH /:id/images/reorder` ·
`PATCH /catalog/images/:id/primary` · `DELETE /catalog/images/:id`

```json
{
  "url": "https://res.cloudinary.com/.../red-1.jpg",
  "publicId": "products/abc123",
  "alt": "Red kurti front",
  "optionValueId": "<red>",
  "sortOrder": 0,
  "isPrimary": false
}
```

- **`optionValueId` scopes the image to a colour** — selecting "Red" swaps the
  gallery. Tied to the *value*, not the variant, so a dress does not need the
  same red photos duplicated across S, M, L and XL.
- The value must belong to an option the product actually uses (`400` otherwise).
- The first image is always primary, so a listing always has a thumbnail.
- Deleting the primary promotes the next one.
- `publicId` is what makes deleting the real file possible; a URL alone cannot
  address the asset.

---

## Storefront

### `GET /products`

| Param | Notes |
|---|---|
| `categoryId` / `categorySlug` | |
| `brandId` / `brandSlug` | |
| `tag` | GIN-indexed |
| `minPrice` / `maxPrice` | Applied to `minPrice` — the "from" price on the card |
| `inStock` | |
| `isFeatured` | |
| `optionValueIds` | Repeatable. `?optionValueIds=<red>&optionValueIds=<l>` |
| `search` | Name, short description, tags. **Unindexed** — see below |
| `sort` | `newest` · `price-asc` · `price-desc` · `rating` · `best-selling` |
| `page`, `limit` | Max 100 |

> **Faceted filtering ANDs across dimensions on the same variant.** Red + L
> matches only if one variant is *both* Red and L. A product with a red XL and a
> blue L does not match — which is what a customer means by "Red, size L".

> `newest` sorts by `publishedAt`, not `createdAt`: a product drafted months ago
> but published today is new to customers.

### `GET /products/:slug`

Returns everything the variant picker needs:

- `productOptions` — the option rows in render order, each with its values,
  `displayType` and `hexColor`
- `variants` — active only, each with `valueIds` identifying its combination
- `inStockValueIds` — lets the frontend grey out a colour with nothing left
- `available` per variant = `stock − reservedStock`

> **`available`, not raw `stock`.** Reserved units are held by carts mid-checkout
> and are not purchasable. Exposing raw stock would oversell during a flash sale.

### Visibility rules

A product appears publicly only when **both** hold:

1. Status is `ACTIVE` or `OUT_OF_STOCK`
2. It is first-party (`sellerId` null) **or** its seller is `APPROVED`

The second is why suspending a supplier pulls their whole catalogue instantly —
the filter lives in one place, so every storefront query inherits it.

---

## Guards, verified

| Attempt | Result |
|---|---|
| Seller reads/edits/deletes another seller's product | `404` (not `403` — ids cannot be probed) |
| Seller passes `?sellerId=<someone else>` | Ignored; scope is forced |
| Seller calls `PATCH /admin/products/:id/status` | `403` |
| Submit with no active variant | `400` — would go live with no price |
| Reject without `rejectionReason` | `400` — the seller would not know what to fix |
| Generate variants before attaching options | `400` |
| Option value from the wrong option | `400` |
| Change options while variants exist | `409` |
| Delete a product/variant used in past orders | `409` |

---

## Known gaps

1. **Search is unindexed.** `?search=` does `ILIKE '%term%'`, a full table scan.
   `pg_trgm` is unavailable on Prisma Postgres (`CREATE EXTENSION` denied,
   error `42501`); Postgres native full-text search needs no extension and is
   the fix. Fine while the catalogue is small.
2. **No facet counts.** The filter works; `Color: Red (24)` does not exist yet.
3. **`soldCount` is never written.** It is read for `best-selling` sorting but
   nothing increments it — that belongs to the order module.
4. **Orphaned uploads.** Uploading an image then abandoning the form leaves a
   Cloudinary file. Deletes and replacements clean up correctly.

---

## Next

`Product` was the blocker for eight of the twelve `FEATURE.md` sections. Now
unblocked: **Cart & Wishlist** → **Order & Checkout** → Payment, Shipment,
Returns, Reviews, and the seller earnings half of the supplier portal.
`Coupon` and `FlashSale` are also unblocked and independent of the cart.
