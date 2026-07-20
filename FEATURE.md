# Feature Capability Map

What the **current** `prisma/schema.prisma` can and cannot support.

Use this to check your requirements against reality: go section by section, and
wherever your requirement hits a ❌ or ⚠️, that is a schema change you need to
plan before writing the service for it.

| | Meaning |
|---|---|
| ✅ | **Ready.** Schema fully supports it. Only application code left to write. |
| ⚠️ | **Partial.** Buildable, but with a real limitation you should know about. |
| ❌ | **Not possible.** Needs a schema change first. |

> Status as of migration `20260720134417_integrity_fixes`.
> Nothing here is built yet — `src/` contains only stub auth controllers.
> This describes what the **data model** allows, not what exists in code.

---

## 1. Authentication & Accounts

| Feature | | Notes |
|---|---|---|
| Email + password register / login | ✅ | `Account.password` with `provider = EMAIL` |
| Google / Facebook login | ✅ | `Account.providerAccountId`; one user can link several providers |
| Multiple login methods on one account | ✅ | `User` 1→N `Account` |
| Refresh token rotation | ✅ | `RefreshToken` with `expiresAt` |
| Server-side logout / revoke session | ✅ | `RefreshToken.revoked` — tokens are DB rows, so you can kill a session |
| Role-based access (admin vs customer) | ✅ | `Role` enum |
| Ban / deactivate a user | ✅ | `User.isActive` |
| **Email verification** | ❌ | `User.isVerified` exists but **nothing can ever set it to true** — no token table |
| **Password reset** | ❌ | No token storage at all |
| Phone / OTP login | ❌ | No OTP table; `User.phone` exists but is unverifiable |
| Force logout on password change | ❌ | Needs `User.passwordChangedAt` to compare against token issue time |
| Staff / vendor / manager roles | ❌ | `Role` has only `ADMIN` and `CUSTOMER` |

**Needed model:**

```prisma
enum TokenType { EMAIL_VERIFICATION, PASSWORD_RESET }

model VerificationToken {
  id         String    @id @default(cuid())
  userId     String?
  identifier String                   // email the token was sent to
  tokenHash  String    @unique        // store a hash, never the raw token
  type       TokenType
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())
  @@index([identifier, type])
}
```

> ⚠️ **Security note:** `RefreshToken.token` stores the **raw** token. If the
> database ever leaks, every live session is directly usable by the attacker.
> Store a hash instead and look up by hash. Cheap to change now, hard later.

---

## 2. Catalog — Category, Brand, Product

| Feature | | Notes |
|---|---|---|
| Unlimited nested categories | ✅ | Self-relation `CategoryTree` |
| Category icon / image / banner / sort order | ✅ | |
| Brands with logo | ✅ | |
| SEO meta on category, brand, product | ✅ | `metaTitle` / `metaDescription` / `metaKeywords` |
| Product draft → publish workflow | ✅ | `ProductStatus` |
| Featured products | ✅ | `Product.isFeatured` |
| Multiple product images, one primary | ✅ | Primary is DB-enforced (one per product) |
| Product video | ✅ | `Product.videoUrl` |
| Free-text spec sheet | ✅ | `Product.specifications Json` (display only) |
| Tags | ✅ | GIN-indexed, so tag filtering is fast |
| Per-variant SKU / barcode / price / stock / weight | ✅ | |
| Strike-through "was" price | ✅ | `ProductVariant.comparePrice` |
| Profit margin reporting | ✅ | `ProductVariant.costPrice` |
| Category delete safety | ✅ | Restricted — can't orphan a subtree |
| **Color × Size variant picker** | ⚠️ | **See below — most important item in this document** |
| Filterable product attributes | ❌ | `specifications` is JSON — cannot be filtered or indexed |
| Variant-specific image gallery | ❌ | `ProductVariant.imageUrl` is a *single* image; `ProductImage` has no `variantId`, so picking "Red" can't swap the gallery |
| Related / cross-sell products | ❌ | No self-relation on `Product` |
| Product bundles / combos | ❌ | |
| Digital / downloadable products | ❌ | |

### ⚠️ The variant modelling limitation

`ProductVariant.name` is a **flat string** (`"Red / L"`). The database does not
know that `"Red / L"` and `"Red / M"` share a colour.

**What this blocks:**

- **Faceted filtering** — "show all Red items in size L" needs
  `name LIKE '%Red%'`: a full table scan, unindexable, and wrong the moment a
  product is called *"Red Velvet Cake"* or someone types `"L / Red"`.
- **Filter counts** — `Color: Red (24) · Blue (11)` cannot be computed.
- **The swatch picker** — the normal product page has a Colour row and a Size
  row, where choosing Red *disables* sizes not stocked in Red. With a flat
  string you only get one long dropdown of every combination.
- **Swatch colours and size order** — nowhere to store a hex code, so sizes sort
  alphabetically as `L, M, S, XL` instead of `S, M, L, XL`.
- **Spelling consistency** — `"Red"`, `"red"`, `"RED"` all become separate
  filter entries.

**You said products will be Color × Size, so this needs fixing.** It is the one
change on this list that gets dramatically more expensive later: retrofitting
means heuristically parsing every historical `name` string, hand-fixing the
misses, and backfilling `OrderItem`. Right now the catalog is empty, so it is a
schema edit and an admin-form change — nothing more.

```prisma
model ProductOption {          // "Color", "Size" — per product
  id        String @id @default(cuid())
  productId String
  name      String
  sortOrder Int    @default(0)
  values    ProductOptionValue[]
  @@unique([productId, name])
}

model ProductOptionValue {     // "Red", "L"
  id        String  @id @default(cuid())
  optionId  String
  value     String
  hexColor  String?            // swatch
  sortOrder Int     @default(0)
  @@unique([optionId, value])
}

model ProductVariantOption {   // this variant IS Red + L
  variantId String
  valueId   String
  @@id([variantId, valueId])
  @@index([valueId])
}
```

`ProductVariant.name` stays as the display label (`"Red / L"`), generated from
the selected values — so invoices and `OrderItem` snapshots keep working.

---

## 3. Search & Discovery

| Feature | | Notes |
|---|---|---|
| Browse by category / brand | ✅ | Composite indexes in place |
| Filter by tag | ✅ | GIN index |
| Featured / newest listings | ✅ | `@@index([status, isFeatured, createdAt DESC])` |
| Sort by price | ⚠️ | Price lives on the **variant**, so product-level sorting has to aggregate in memory — breaks past a few hundred products |
| Text search ("shirt") | ⚠️ | **Works but is unindexed** — every search is a full table scan |
| Sort by rating / best-selling | ❌ | Needs denormalized counters on `Product` |
| Price-range filter | ❌ | Needs `minPrice` / `maxPrice` on `Product` |
| Filter counts in the sidebar | ❌ | Needs the structured options from §2 |
| Autocomplete / "did you mean" | ❌ | |

### The search index problem

The old `@@index([name])` was removed because it was **misleading** — search
issues `ILIKE '%term%'`, and a leading wildcard makes a btree unusable. It
looked like search support while providing none.

The normal fix is a `pg_trgm` trigram index, **but Prisma Postgres denies
`CREATE EXTENSION`** (verified: error `42501`, only `plpgsql` and
`prisma_postgres` are installed). Your options:

1. **Postgres full-text search** — `tsvector` + GIN. Core Postgres, *no
   extension needed*, so it works on your current hosting. Best value.
   (Note: Postgres has no Bangla dictionary — use the `simple` config.)
2. **Move to a Postgres host that allows extensions** (Neon, Supabase, self-hosted)
   and use trigram search, which handles typos better.
3. **A search engine** (Meilisearch / Typesense) — only worth it past ~50k
   products or if you need Bangla stemming.

**Recommended denormalized fields on `Product`** (maintained by app code —
these unlock price sort, rating sort, and best-seller sort, none of which are
possible today):

```prisma
minPrice    Decimal? @db.Decimal(10, 2)
maxPrice    Decimal? @db.Decimal(10, 2)
avgRating   Float    @default(0)
reviewCount Int      @default(0)
totalStock  Int      @default(0)
soldCount   Int      @default(0)
publishedAt DateTime?
```

---

## 4. Cart & Wishlist

| Feature | | Notes |
|---|---|---|
| One cart per logged-in user | ✅ | |
| Add / update quantity / remove | ✅ | `@@unique([cartId, variantId])` prevents duplicate lines |
| Wishlist | ✅ | One entry per user+product |
| Cart survives logout/login | ✅ | Server-side, not a cookie |
| Live price in cart | ✅ | Cart deliberately does **not** snapshot price, so it always shows current price |
| **Guest cart** | ❌ | `Cart.userId` is **required** — anonymous visitors cannot hold a cart |
| Merge guest cart on login | ❌ | Depends on the above |
| Abandoned-cart recovery | ❌ | No `expiresAt`, no way to find stale carts |
| "Save for later" | ❌ | |

---

## 5. Checkout & Orders

| Feature | | Notes |
|---|---|---|
| Multiple saved addresses | ✅ | One default per user, **DB-enforced** |
| Bangladesh address format | ✅ | division / district / upazila / area |
| Order with invoice number | ✅ | `invoiceNo @unique` |
| Price breakdown | ✅ | subtotal / discount / shippingCharge / total |
| **Correct historical invoices** | ✅ | `OrderItem` snapshots title/sku/price/image, and `Order` snapshots the full ship-to address — editing a product or address later cannot rewrite past orders |
| Order lifecycle | ✅ | 7 states, PENDING → DELIVERED / CANCELLED / RETURNED |
| Tracking number | ✅ | Plain string field |
| Order notes | ✅ | |
| **Guest checkout** | ❌ | `Order.userId` is **required**. Note `Order.email`/`phone` already exist, which suggests this was originally intended |
| **Order status timeline** | ❌ | Only the *current* status is stored. No "Placed 12 Jul → Shipped 13 Jul" tracking, no record of who cancelled or why |
| **Returns / refunds** | ❌ | `RETURNED` and `REFUNDED` exist as enum values with **no table behind them** — you cannot record which items came back, why, or how much was refunded |
| Tax / VAT | ❌ | No tax field. Add `tax Decimal @default(0)` now even if unused — retrofitting makes every historical total un-decomposable |
| Flexible shipping rates | ⚠️ | `Setting` hardcodes only inside-Dhaka / outside-Dhaka. No per-district rates, no weight-based charge (`ProductVariant.weight` is captured but unused), no express option, no COD surcharge |
| Partial shipment | ❌ | |
| Courier integration (Pathao / Steadfast / RedX) | ❌ | `trackingNumber` is a bare string with no courier name |

> 💡 **Guest checkout is now half-done.** `Order.addressId` was already made
> optional during the integrity migration, which was the hard part. What
> remains: make `Order.userId` and `Cart.userId` nullable and add
> `Cart.sessionId`.

---

## 6. Payments

| Feature | | Notes |
|---|---|---|
| COD, bKash, SSLCommerz | ✅ | |
| **Retry after a failed payment** | ✅ | One `Payment` row per attempt — a failed bKash try, the retry, and a refund all coexist instead of overwriting each other |
| **Safe webhook replay** | ✅ | `transactionId @unique` — bKash and SSLCommerz both retry IPN callbacks, and a duplicate now collides instead of double-inserting |
| Full gateway audit trail | ✅ | `gatewayResponse Json` per attempt |
| Payment reconciliation reports | ✅ | `@@index([status, createdAt])` |
| Refund records | ❌ | Setting `status = REFUNDED` **overwrites** the successful capture. You lose proof of what was originally taken. Needs a separate `Refund` table |
| Partial payment / installment | ❌ | |
| Wallet / store credit | ❌ | |

---

## 7. Promotions — Coupons & Flash Sales

| Feature | | Notes |
|---|---|---|
| Percentage or fixed-amount coupon | ✅ | |
| Minimum order / maximum discount cap | ✅ | |
| Total usage limit | ✅ | **DB-enforced** — cannot exceed the cap |
| Per-user usage limit | ✅ | Counted from `CouponRedemption`, so it is accurate |
| Date-windowed campaigns | ✅ | `startsAt` / `expiresAt` |
| **Safe against double-redemption** | ✅ | `@@unique([couponId, orderId])` — a replayed checkout cannot double-count |
| Discount provenance on old orders | ✅ | `Order.couponCode` snapshot survives coupon deletion |
| Flash sale with countdown | ✅ | `@@index([isActive, startsAt, endsAt])` |
| Per-variant sale price + quantity cap | ✅ | Cap is DB-enforced |
| Coupon stacking control with flash sales | ✅ | `Coupon.applyWithFlashSale` |
| Category- or product-scoped coupons | ❌ | Coupons are store-wide only — no "20% off Electronics" |
| Free-shipping coupon | ❌ | `DiscountType` has only `PERCENTAGE` and `FIXED` |
| First-order-only coupon | ❌ | |
| BOGO / tiered discounts | ❌ | |
| Gift cards / loyalty points | ❌ | |
| Overlapping flash sales on one variant | ⚠️ | Nothing prevents two *concurrent* sales containing the same variant — the pricing resolver would get two valid prices with no tiebreak. Enforce in app code, or add an exclusion constraint |

---

## 8. Reviews & Ratings

| Feature | | Notes |
|---|---|---|
| Star rating with comment | ✅ | Rating is **DB-constrained to 1–5** |
| Review photos | ✅ | `Review.images` |
| One review per user per product | ✅ | |
| **Moderation before publishing** | ❌ | No `status` field — **reviews and their images go live instantly**. Anyone can publish arbitrary images onto your product pages |
| "Verified Purchase" badge | ❌ | No link to an order, so any registered user can review a product they never bought — the standard fake-review vector |
| Admin reply to a review | ❌ | |
| Helpful / unhelpful votes | ❌ | |
| Average rating on listings | ❌ | Must aggregate across all reviews on every page load |
| Second review after re-purchase | ❌ | `@@unique([userId, productId])` blocks it |

**Minimum fix:**

```prisma
enum ReviewStatus { PENDING, APPROVED, REJECTED }

model Review {
  status       ReviewStatus @default(PENDING)
  orderItemId  String?      @unique   // proves purchase
  isVerified   Boolean      @default(false)
  adminReply   String?
  @@index([productId, status, createdAt])
}
```

---

## 9. Content & Store Settings

| Feature | | Notes |
|---|---|---|
| Homepage banners (desktop + mobile) | ✅ | With CTA button, sort order, active flag |
| Store name / logo / favicon | ✅ | |
| Social links, support email & phone | ✅ | |
| Currency + symbol | ✅ | Single currency only |
| Facebook Pixel / Google Analytics IDs | ✅ | |
| Maintenance mode | ✅ | |
| Shipping charge config | ⚠️ | Only the two hardcoded Dhaka fields |
| **CMS pages (Terms / Privacy / Refund Policy)** | ❌ | ⚠️ **bKash and SSLCommerz merchant onboarding require live policy pages on your domain.** This blocks payment-gateway approval, not code |
| Blog / articles | ❌ | |
| FAQ | ❌ | |
| Contact form submissions | ❌ | |
| Newsletter subscribers | ❌ | |

---

## 10. Notifications

| Feature | | Notes |
|---|---|---|
| In-app notifications, typed | ✅ | SYSTEM / ORDER / PAYMENT / PROMOTION |
| Read / unread with deep link | ✅ | Indexed for the notification dropdown |
| Email / SMS / push delivery log | ❌ | No record of what was actually sent |
| Reusable templates | ❌ | |

---

## 11. Admin & Operations

| Feature | | Notes |
|---|---|---|
| Admin role | ✅ | |
| Order queue by status | ✅ | `@@index([orderStatus, createdAt DESC])` |
| Stock tracking | ✅ | **`stock` can never go negative** — DB-enforced, so a flash sale cannot silently oversell |
| Low-stock alerts | ❌ | No `lowStockThreshold` |
| Stock reservation during checkout | ❌ | Two customers can both reach payment for the last unit — nothing holds stock between "add to cart" and "payment confirmed" |
| Stock movement history | ❌ | Cannot answer "why is stock 3 when I received 50?" |
| Backorder / pre-order | ❌ | |
| Admin audit log | ❌ | No record of who changed a price or cancelled an order |
| Granular permissions | ❌ | Admin is all-or-nothing |
| Multi-vendor marketplace | ❌ | Large change — decide **early** if you ever want it |

---

## Priority Summary

### 🔴 Do before writing more services — these change column shapes

Once services are written against the current shape, changing it means
rewriting those services too.

| # | Change | Why now |
|---|---|---|
| 1 | **Structured variant options** (§2) | You confirmed Color × Size. Retrofitting means parsing every historical variant name by guesswork |
| 2 | **`VerificationToken`** (§1) | `isVerified` can never become true, and there is no password reset. Blocks the auth module you are building **right now** |
| 3 | **Guest checkout nullability** (§4, §5) | Forced registration before COD is a well-known conversion killer in BD. Half-done already |
| 4 | **`Order.tax`** (§5) | One line of insurance, even if always zero |
| 5 | **Hash `RefreshToken.token`** (§1) | Free today; a DB leak hands over live sessions |

### 🟡 Before launch — purely additive, safe to defer a little

| # | Change | Why |
|---|---|---|
| 6 | **CMS `Page` model** (§9) | bKash / SSLCommerz onboarding needs live policy pages |
| 7 | **Review moderation** (§8) | Right now anyone can publish images to your product pages |
| 8 | **Returns / refunds tables** (§5, §6) | COD markets have high return rates; spreadsheets are how reconciliation breaks |
| 9 | **`OrderStatusHistory`** (§5) | Customers expect a tracking timeline |
| 10 | **Denormalized `Product` counters** (§3) | Price sort, rating sort, best-seller sort are all impossible without them |
| 11 | **Shipping zones** (§5) | Seed with two zones and behaviour is identical — but checkout is then written against a rate resolver instead of `if (district === 'Dhaka')` |
| 12 | **Full-text search** (§3) | Search is a full table scan today |

### 🟢 Safe to defer

Courier integration · stock movement ledger · related products · coupon scoping ·
newsletter & contact forms · admin audit log · helpful votes · abandoned-cart
recovery · dedicated search engine · multi-currency · gift cards & loyalty ·
product Q&A · bundles · subscriptions

### ⚪ Decide early (expensive to add later)

- **Multi-vendor?** Touches products, orders, payouts, and permissions everywhere.
- **Multi-currency?** Every `Decimal` column would need a currency companion.

---

## How to use this with your requirements

1. Go through your requirement list section by section.
2. Every requirement landing on ❌ or ⚠️ is a schema change — put it in the
   🔴 bucket if it changes an existing column, 🟡 if it only adds new tables.
3. Anything in 🔴 should be done **before** the matching service code exists.

If a requirement isn't listed here at all, it probably needs new models — worth
checking before you start building against the current schema.
