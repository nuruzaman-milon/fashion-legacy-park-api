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

- Auth is provider-based: `User` holds identity, `Account` holds credentials per `AuthProvider` (EMAIL/GOOGLE/FACEBOOK) with a nullable `password`. There is no password column on `User`. `RefreshToken` is a DB table with `revoked`/`expiresAt`, so sessions are meant to be server-revocable.
- Pricing and stock live on `ProductVariant`, not `Product`. Cart items, order items, and flash-sale items all reference `variantId`. A product with no variants has no price.
- `OrderItem` snapshots `title`, `sku`, `unitPrice`, and `image` at purchase time — do not resolve these through the variant relation when displaying past orders.
- All money is `Decimal @db.Decimal(10, 2)`, which Prisma returns as `Decimal` objects, not numbers. Convert explicitly before arithmetic or JSON serialization.
- `Setting` is a singleton-style table (shipping charges, social links, maintenance mode) with no enforced single row.
