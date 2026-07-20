# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

E-commerce backend for a Bangladesh-market storefront (BDT/COD/bKash/SSLCommerz, division–district–upazila addresses). Express 5 + TypeScript + Prisma 6 on PostgreSQL.

The project is early: the Prisma schema is essentially complete, but only the `auth` module exists in `src/`, and its controllers are still stubs returning placeholder messages. `bcrypt`, `jsonwebtoken`, `multer`, and `cloudinary` are installed but not yet wired up. Expect to be building features, not maintaining them.

## Commands

```bash
npm run dev              # ts-node-dev, hot reload, src/server.ts
npm run build            # tsc -> dist/
npm start                # node dist/server.js

npm run prisma:generate  # regenerate client after schema edits
npm run prisma:migrate    # prisma migrate dev (creates + applies migration)
npm run prisma:studio     # DB browser
```

No test runner, linter, or formatter is configured. There is no `.env.example`; `DATABASE_URL` and `PORT` are the only env vars currently read.

## Architecture

`server.ts` loads dotenv **before** importing `app.ts` — keep that ordering when adding modules that read `process.env` at import time.

Routing is three layers: `app.ts` mounts `src/routes/index.ts` at `/api/v1`, which mounts each feature router. All new routes go under `/api/v1`.

### Module pattern

Features live in `src/modules/<name>/` and split into `<name>.routes.ts` → `<name>.controller.ts` → `<name>.service.ts`, with `<name>.validation.ts` (Zod) and `<name>.interface.ts` alongside. Follow `modules/auth/` for file naming, but note its `service.ts` and `index.ts` are empty — routes and controllers are the only parts actually established. Controllers should stay thin and delegate DB work to the service, which imports the singleton `src/lib/prisma.ts`.

### Request/response conventions

- Every async handler wraps in `catchAsync` so rejections reach the global error handler. Without it, errors hang the request.
- Responses go through `sendResponse(res, statusCode, { success, message, data? })` rather than `res.json` directly.
- Throw `ApiError(statusCode, message)` for expected failures; `error.middleware.ts` maps anything else to a 500.
- **Zod schemas must be wrapped in an object with a `body` key** — `validateRequest` parses `{ body: req.body }` and reassigns `req.body = result.data.body`. A bare `z.object({ email: ... })` will silently fail validation. Export the inferred type as `z.infer<typeof schema>["body"]`.

### Data model notes

See `FEATURE.md` for the full capability map — what the schema supports, what it doesn't, and the business model it encodes.

- **Business model:** supplier portal with a single-brand storefront. Sellers are external suppliers with their own admin panel; the customer-facing site never exposes them. Settlement is per-order via `SellerLedger` → `Payout`.
- Auth is provider-based: `User` holds identity, `Account` holds credentials per `AuthProvider` with a nullable `password`. There is no password column on `User`. Refresh and verification tokens are stored **hashed** (`tokenHash`), never raw.
- Pricing and stock live on `ProductVariant`, not `Product`. A product with no variants has no price.
- **Variant options are a global library.** `Option`/`OptionValue` are defined once and reused across products; `ProductOption` declares which options a product uses and `ProductVariantOption` links a variant to its values. `ProductVariant.name` is a generated display label — never filter on it, join through `ProductVariantOption` instead.
- **Historical records snapshot what they depend on.** `Order` snapshots the ship-to address and coupon; `OrderItem` snapshots title/variant/sku/price/image and `sellerId`; `SellerLedger` snapshots the commission rate. Never resolve these through their relations when displaying past orders — the relation may be null or changed.
- All money is `Decimal @db.Decimal(10, 2)`, which Prisma returns as `Decimal` objects, not numbers. Convert explicitly before arithmetic or JSON serialization.
- `Setting` is a true singleton — a CHECK constraint pins `id = 'singleton'`.

### Constraints live in raw SQL

Prisma's DSL cannot express CHECK constraints or partial unique indexes, so both migrations end with a hand-written SQL block (search for `Raw SQL` in `prisma/migrations/*/migration.sql`). These enforce non-negative stock, coupon/flash-sale usage caps, `netPayable = gross − commission`, flash-sale rule scope integrity, one default variant per product, and more.

**If you regenerate a migration, that block does not carry over — re-append it.** `prisma migrate dev` is interactive and fails in non-TTY shells; use `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` into a hand-made migration folder, then `prisma migrate deploy`.

`pg_trgm` is unavailable — Prisma Postgres denies `CREATE EXTENSION` (error `42501`). Product text search is deliberately unindexed as a result; see `FEATURE.md` → Search.

### Invariants the database cannot enforce

`FEATURE.md` ends with a list of correctness rules the application must uphold. The load-bearing ones: refresh-token checks must compare against `User.passwordChangedAt`; denormalized `Product` fields (`minPrice`, `avgRating`, `soldCount`, `totalStock`) must be recalculated on the writes that affect them; `Order.paymentStatus`/`orderStatus` are caches that must be updated in the same transaction as the underlying Payment/Shipment write; stock decrements must be conditional updates, not read-then-write.
