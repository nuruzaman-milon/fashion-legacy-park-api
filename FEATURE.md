# Feature Capability Map

What the current `prisma/schema.prisma` can and cannot support.

| | Meaning |
|---|---|
| ✅ | **Ready.** Schema fully supports it. Only application code left to write. |
| ⚠️ | **Partial.** Buildable, but with a real limitation you should know about. |
| ❌ | **Not possible.** Needs a schema change first. |

> Status as of migration `20260720161237_marketplace_v2`.
> Nothing is built yet — `src/` contains only stub auth controllers. This
> describes what the **data model** allows, not what exists in code.

---

## Business model

**Supplier portal, single-brand storefront.**

Sellers are external suppliers with their own admin panel. They manage their own
catalogue and see their own sales and earnings. The customer-facing storefront
never exposes them — every product is presented as Aydin Bazar's own. There are
no seller storefronts, no "Sold by X" badges, and no seller filters on search.

Settlement is per-order: each sold line writes a `SellerLedger` row with the
commission rate snapshotted, and rows are grouped into `Payout` records.

---

## 1. Authentication & Accounts

| Feature | | Notes |
|---|---|---|
| Email + password register / login | ✅ | `Account.password`, `provider = EMAIL` |
| Google / Facebook login | ✅ | One user can link several providers |
| **Email verification** | ✅ | `VerificationToken` + `User.emailVerifiedAt` |
| **Password reset** | ✅ | `VerificationToken` with `type = PASSWORD_RESET` |
| **Force logout on password change** | ✅ | `User.passwordChangedAt` — reject every token issued before it, no need to enumerate sessions |
| Server-side logout / revoke session | ✅ | `RefreshToken.revoked` |
| Token theft resistance | ✅ | Tokens are stored **hashed**, so a DB leak does not hand over live sessions |
| **Multi-role** | ✅ | `SUPER_ADMIN` / `ADMIN` / `SELLER` / `CUSTOMER` |
| Ban / deactivate | ✅ | `User.isActive` |
| Login audit | ✅ | `User.lastLoginAt`, `RefreshToken.userAgent` / `ipAddress` |
| Phone / OTP login | ❌ | `phoneVerifiedAt` exists but `TokenType` has no `PHONE_OTP` |
| Per-permission custom roles | ❌ | Role is a fixed enum. `SUPER_ADMIN` vs `ADMIN` must be enforced in code |

> **Application rule:** `passwordChangedAt` only works if every token check
> compares `RefreshToken.createdAt >= user.passwordChangedAt`. The schema
> cannot enforce that — it must be in the auth service.

---

## 2. Seller / Supplier Portal

| Feature | | Notes |
|---|---|---|
| Seller onboarding + approval | ✅ | `SellerStatus`: PENDING → APPROVED / SUSPENDED / REJECTED |
| Seller manages own catalogue | ✅ | `Product.sellerId`, scoped queries |
| **Product approval before going live** | ✅ | `PENDING_APPROVAL` → `ACTIVE` / `REJECTED`, with `rejectionReason` |
| Seller sees own products & sales | ✅ | `@@index([sellerId, status])`, `OrderItem.sellerId` |
| **Per-order commission** | ✅ | `SellerLedger` — rate **snapshotted**, so changing a seller's rate never rewrites past earnings |
| Payout batches | ✅ | `Payout` with period range, method, transaction ref |
| Payable vs pending earnings | ✅ | `LedgerStatus`: PENDING → PAYABLE → PAID / CANCELLED |
| Bank / bKash payout details | ✅ | On `Seller` |
| Storefront hides sellers | ✅ | By design — no seller field is ever queried on the storefront |
| Seller-uploaded product images | ✅ | Via `ProductImage` |
| Seller-specific shipping rules | ❌ | Shipping is store-wide |
| Seller performance ratings | ❌ | |

> **Settlement correctness is DB-enforced:** `netPayable = grossAmount −
> commissionAmount`, commission cannot exceed gross, and commission rate is
> capped at 0–100%. A bad calculation is rejected rather than silently paid out.

---

## 3. Catalog — Category, Brand, Product, Variants

| Feature | | Notes |
|---|---|---|
| Unlimited nested categories | ✅ | Deleting a parent is blocked, so no orphaned subtree |
| Brands | ✅ | |
| SEO meta everywhere | ✅ | |
| Draft → approval → publish | ✅ | |
| Featured products | ✅ | |
| **Color × Size variants** | ✅ | Dress: Red/S, Red/L, Blue/S… each with its own stock and price |
| **Weight / volume variants** | ✅ | Shampoo: 250gm, 500gm — different price and stock |
| **Any option combination** | ✅ | A product declares which options it uses; variants are combinations |
| **Consistent option spelling** | ✅ | Global library — sellers pick from a dropdown, so "Red"/"red"/"RED" cannot diverge |
| **Colour swatches** | ✅ | `OptionValue.hexColor`, `Option.displayType = SWATCH` |
| **Correct size ordering** | ✅ | `OptionValue.sortOrder` — S, M, L, XL instead of alphabetical L, M, S, XL |
| **Store-wide faceted filter** | ✅ | "All Red items in size L" is an indexed join, not a `LIKE` over a display string |
| **Colour-scoped image gallery** | ✅ | `ProductImage.optionValueId` — selecting Red swaps the gallery, without duplicating photos across S/M/L/XL |
| Strike-through "was" price | ✅ | `comparePrice` |
| Margin reporting | ✅ | `costPrice`, never exposed to customers |
| Low-stock threshold | ✅ | `lowStockThreshold` |
| **Stock reservation during checkout** | ✅ | `reservedStock`, DB-capped so it can never exceed real stock |
| Filterable product attributes (non-variant) | ⚠️ | `specifications Json` is display-only. For filtering, model it as an Option instead |
| Related / cross-sell products | ❌ | |
| Product bundles | ❌ | |
| Digital products | ❌ | |

### How the variant model works

```
Option ("Color", SWATCH)          global, defined once
  └── OptionValue ("Red", #FF0000, sortOrder 1)

Product "Kurti"
  ├── ProductOption → Color  (sortOrder 1)
  ├── ProductOption → Size   (sortOrder 2)
  ├── ProductVariant "Red / S"  sku K-RED-S  ৳1200  stock 10
  │     └── ProductVariantOption → Red, S
  └── ProductVariant "Red / L"  sku K-RED-L  ৳1250  stock 5
        └── ProductVariantOption → Red, L
```

`ProductVariant.name` is a generated display label for invoices. The
authoritative structure is `ProductVariantOption`, which is what filtering
queries join against.

---

## 4. Search & Discovery

| Feature | | Notes |
|---|---|---|
| Browse by category / brand | ✅ | |
| Filter by tag | ✅ | GIN index |
| **Sort by price** | ✅ | `Product.minPrice` / `maxPrice`, indexed |
| **Price-range filter** | ✅ | Same fields — this is the selling price |
| **Sort by rating** | ✅ | `Product.avgRating`, indexed |
| **Sort by best-selling** | ✅ | `Product.soldCount`, indexed |
| Sort by newest | ✅ | `publishedAt`, indexed |
| Filter by colour / size across the store | ✅ | Via the option library |
| In-stock filter | ✅ | `Product.totalStock` |
| **Text search ("shirt")** | ⚠️ | **Works but unindexed** — every search is a full table scan |
| Filter counts in the sidebar | ✅ | Joinable via `ProductVariantOption` |
| Autocomplete / typo tolerance | ❌ | |

> ⚠️ **The denormalised fields are maintained by application code, not the
> database.** `minPrice`, `maxPrice`, `totalStock`, `soldCount`, `avgRating`,
> `reviewCount` must be recalculated whenever a variant price/stock changes, an
> order completes, or a review is approved. If you forget, listings silently go
> stale. Put this in a shared service, not in individual controllers.

> ⚠️ **Text search has no index.** `pg_trgm` is unavailable — Prisma Postgres
> denies `CREATE EXTENSION` (verified: error `42501`). Options:
> 1. **Postgres full-text search** (`tsvector` + GIN) — core Postgres, no
>    extension needed, works on your current host. Use the `simple` config;
>    there is no Bangla dictionary.
> 2. Move to a host that allows extensions (Neon, Supabase, self-hosted).
> 3. A search engine — only past ~50k products.
>
> With an empty catalogue `ILIKE` is genuinely fine for now. Revisit before the
> catalogue grows.

---

## 5. Cart & Wishlist — login required by design

| Feature | | Notes |
|---|---|---|
| Cart per logged-in user | ✅ | |
| Add / update / remove | ✅ | Duplicate lines impossible |
| Wishlist | ✅ | |
| Cart survives logout / login | ✅ | Server-side |
| Live price in cart | ✅ | Price deliberately not snapshotted |
| Guest cart / wishlist | ❌ | **Intentional** — login is required |
| Abandoned-cart recovery | ❌ | No `expiresAt` |
| Save for later | ❌ | |

---

## 6. Checkout & Orders

| Feature | | Notes |
|---|---|---|
| Multiple saved addresses | ✅ | One default per user, DB-enforced |
| Bangladesh address format | ✅ | division / district / upazila |
| **Correct historical invoices** | ✅ | Order snapshots the ship-to address; OrderItem snapshots title/variant/sku/price/image. Editing a product or address cannot rewrite the past |
| **Tax / VAT** | ✅ | `Order.tax` + `taxRate` snapshot; `Setting.vatRate` / `vatEnabled` |
| **Order status timeline** | ✅ | `OrderStatusHistory` with from→to, who changed it, and `isPublic` to hide internal notes |
| Milestone timestamps | ✅ | `confirmedAt` / `shippedAt` / `deliveredAt` / `cancelledAt` for dashboards |
| Cancel with reason | ✅ | `cancelReason`, `cancelledById` |
| Guest checkout | ❌ | **Intentional** — login required |
| Order money sanity | ✅ | No component of an order total can go negative |
| Flexible shipping rates | ⚠️ | `Setting` still has only inside/outside-Dhaka. No per-district, weight-based, or express rates |
| Partial shipment | ⚠️ | Multiple `Shipment` rows per order are allowed, but items are not assigned to a specific shipment |

---

## 7. Shipping & Courier

| Feature | | Notes |
|---|---|---|
| **Pathao / Steadfast / RedX / Paperfly / Sundarban** | ✅ | `Courier` enum, plus `MANUAL` |
| Consignment / tracking id | ✅ | |
| **Safe courier webhooks** | ✅ | `@@unique([courier, consignmentId])` — a replayed callback collides instead of creating a duplicate shipment |
| Full courier status history | ✅ | `ShipmentStatusLog` keeps the courier's raw status string and payload |
| COD amount + delivery fee | ✅ | |
| Shipping label / tracking URL | ✅ | |
| Automatic rate lookup | ❌ | Needs the shipping-zone model |
| Items assigned per shipment | ❌ | |

---

## 8. Payments & Refunds

| Feature | | Notes |
|---|---|---|
| COD, bKash, SSLCommerz | ✅ | |
| Retry after failed payment | ✅ | One `Payment` row per attempt — the failure and its gateway payload survive |
| Safe webhook replay | ✅ | `transactionId @unique` |
| Full gateway audit trail | ✅ | `gatewayResponse Json` per attempt |
| **Refund records** | ✅ | Separate `Refund` table — refunding does **not** overwrite the capture, so proof of what was taken survives |
| Partial refunds | ✅ | Multiple `Refund` rows; `PARTIALLY_REFUNDED` status |
| Refund linked to a return | ✅ | `Refund.returnRequestId` |
| Refund amount sanity | ✅ | Zero/negative refunds rejected |
| Partial payment / installment | ❌ | |
| Wallet / store credit | ❌ | |

---

## 9. Returns

| Feature | | Notes |
|---|---|---|
| Customer return request | ✅ | `ReturnRequest` with reference, reason, photos |
| **Partial returns** | ✅ | `ReturnItem` — 2 of 5 items can come back |
| Return approval workflow | ✅ | REQUESTED → APPROVED / REJECTED → RECEIVED → REFUNDED |
| Restock tracking | ✅ | `ReturnItem.restocked` |
| Return window config | ✅ | `Setting.returnWindowDays` — also gates when seller earnings become PAYABLE |
| Return reasons | ✅ | DAMAGED / WRONG_ITEM / SIZE_ISSUE / QUALITY_ISSUE / … |
| Return shipping labels | ❌ | |

---

## 10. Promotions

| Feature | | Notes |
|---|---|---|
| Percentage / fixed coupon | ✅ | Percentage capped at 100%, DB-enforced |
| **Free-shipping coupon** | ✅ | `DiscountType.FREE_SHIPPING` |
| **Category-scoped coupon** | ✅ | `CouponCategory` |
| **Product-scoped coupon** | ✅ | `CouponProduct` |
| Store-wide coupon | ✅ | Attach neither → applies everywhere |
| Usage limits (total + per user) | ✅ | Total limit DB-enforced; per-user counted from the redemption ledger |
| No double-redemption | ✅ | `@@unique([couponId, orderId])` — a replayed checkout cannot double-count |
| Discount provenance on old orders | ✅ | `Order.couponCode` survives coupon deletion |
| **Flash sale by category** | ✅ | `FlashSaleRule` with `scope = CATEGORY` — products added later join automatically |
| **Flash sale by product / variant** | ✅ | Same table, different scope |
| Rule integrity | ✅ | A rule must target exactly one thing matching its scope — DB-enforced |
| Per-variant quantity cap | ✅ | `FlashSaleItem.quantityLimit` + `soldCount`, cap DB-enforced |
| Sale period sanity | ✅ | `endsAt > startsAt` enforced |
| First-order-only coupon | ❌ | |
| BOGO / tiered discounts | ❌ | |
| Gift cards / loyalty | ❌ | |

### Flash sale price resolution

Several rules can match one variant. Priority — **application code must
implement this**, the schema only stores the rules:

```
VARIANT rule  >  PRODUCT rule  >  CATEGORY rule
```

⚠️ Two **concurrently active** flash sales can both contain the same variant.
Nothing prevents it, so the resolver needs a deterministic tiebreak (most
recent sale, or highest discount) — otherwise pricing is non-deterministic.

---

## 11. Reviews & Ratings

| Feature | | Notes |
|---|---|---|
| Star rating + comment + photos | ✅ | Rating DB-constrained to 1–5 |
| **Moderation before publishing** | ✅ | Defaults to `PENDING`, so user-uploaded images never hit product pages unreviewed |
| **Verified purchase badge** | ✅ | `Review.orderItemId` proves the purchase |
| **Second review after re-purchase** | ✅ | Keyed on the purchased line, not on (user, product) |
| One review per purchased line | ✅ | `orderItemId @unique` |
| **Average rating on listings** | ✅ | `Product.avgRating` + `reviewCount`, indexed for sorting |
| Admin reply | ✅ | |
| Helpful votes | ✅ | Counter field present |

> ⚠️ `avgRating` and `reviewCount` are **not** auto-calculated. Recompute them
> when a review is approved, edited, or rejected.

---

## 12. Content, Notifications, Settings

| Feature | | Notes |
|---|---|---|
| Homepage banners | ✅ | |
| **CMS pages** | ✅ | `Page` — Terms / Privacy / Refund Policy. **Required for bKash and SSLCommerz merchant onboarding** |
| Store settings singleton | ✅ | DB-pinned to exactly one row |
| Currency, social links, pixel IDs | ✅ | Single currency |
| Maintenance mode | ✅ | |
| In-app notifications | ✅ | Typed, incl. `SELLER` |
| Shipping charge config | ⚠️ | Only inside/outside Dhaka |
| Email / SMS delivery log | ❌ | |
| Blog / FAQ | ❌ | |
| Contact form / newsletter | ❌ | |
| Admin audit log | ❌ | `*ById` audit columns exist on key tables, but there is no general log |

---

## What is left

### 🟡 Worth doing before launch

| # | Item | Why |
|---|---|---|
| 1 | **Full-text search index** | Search is a full table scan today (§4) |
| 2 | **Shipping zones** | Only two hardcoded Dhaka rates. `ProductVariant.weight` is captured but unused (§6) |
| 3 | **Denormalised-field service** | `minPrice` / `avgRating` / `soldCount` / `totalStock` go stale unless recalculated centrally (§4) |
| 4 | **Flash sale tiebreak logic** | Overlapping sales are pricing-ambiguous (§10) |
| 5 | **Phone OTP** | Add `PHONE_OTP` to `TokenType` if you want phone signup (§1) |

### 🟢 Safe to defer

Related products · product bundles · first-order coupons · BOGO · gift cards &
loyalty · wallet / store credit · abandoned-cart recovery · email & SMS delivery
logs · blog & FAQ · contact form · newsletter · admin audit log · per-permission
custom roles · seller performance ratings · return shipping labels · dedicated
search engine · multi-currency

### ⚪ Decide before you outgrow it

- **Multi-currency** — every `Decimal` would need a currency companion.
- **Per-permission roles** — if `ADMIN` needs to be split into finer staff
  roles, `User.role` becomes a join table.

---

## Rules the database cannot enforce

These are correctness requirements the schema **assumes** the application
upholds. Each one is a silent-corruption bug if missed:

1. **Refresh token check** must compare against `User.passwordChangedAt`, or
   "force logout on password change" does nothing.
2. **Denormalised product fields** must be recalculated on the writes that
   affect them.
3. **`Order.paymentStatus` / `orderStatus`** are caches of the Payment and
   Shipment ledgers — update them in the *same transaction* as the underlying
   write, never separately.
4. **Stock decrement** must use a conditional update
   (`updateMany where stock >= qty`), not read-then-write. The CHECK constraint
   is the last line of defence, not the first.
5. **`SellerLedger` rows** are written at order time and moved to `PAYABLE`
   only after the return window closes.
6. **Flash sale resolution priority** (VARIANT > PRODUCT > CATEGORY) lives
   entirely in code.
