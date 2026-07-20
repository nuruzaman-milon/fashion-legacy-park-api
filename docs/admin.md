# Admin, Seller & Account API

Companion to [`auth.md`](./auth.md), which covers login, registration and
password flows. This document covers everything built on top of them.

Base URL: `http://localhost:5000/api/v1`

---

## Contents

1. [Getting your first admin](#getting-your-first-admin)
2. [Roles and guards](#roles-and-guards)
3. [Admin — user management](#admin--user-management)
4. [Admin — seller management](#admin--seller-management)
5. [Seller — own profile](#seller--own-profile)
6. [Account self-service](#account-self-service)
7. [Addresses](#addresses)
8. [Pagination](#pagination)
9. [Rate limits](#rate-limits)

---

## Getting your first admin

Registration always creates a `CUSTOMER`, and changing a role requires an
existing `SUPER_ADMIN` — so the first one has to be seeded.

```bash
# .env
SEED_ADMIN_EMAIL=admin@aydinbazar.com
SEED_ADMIN_PASSWORD=Adm!nStr0ng2026
SEED_ADMIN_NAME=Super Admin
```

```bash
npm run db:seed
```

The seeded account is created **pre-verified**, so you can log in immediately
with no email step.

Re-running is safe. It never resets an existing admin's password — so it cannot
be used to take over the account by re-seeding.

---

## Roles and guards

| Role | Can do |
|---|---|
| `SUPER_ADMIN` | Everything, including changing roles |
| `ADMIN` | User list, activate/deactivate, all seller management. **Cannot change roles** |
| `SELLER` | Their own shop profile. Later: their own products and sales |
| `CUSTOMER` | Their own account, addresses, orders |

Guards come from `authenticate` + `authorize(...)` in
`src/middlewares/auth.middleware.ts`.

**Role and status changes take effect immediately.** `authenticate` reads
`role` and `isActive` from the database on every request, so a demoted or
deactivated user is stopped on their very next call — no waiting for their
access token to expire. The `role` claim inside the JWT is informational only.

**Failure codes:** `401` no or invalid token · `403` authenticated but the role
is not allowed.

---

## Admin — user management

All routes require `authenticate`.

### `GET /admin/users` — `ADMIN`, `SUPER_ADMIN`

Query: `page`, `limit`, `sortBy`, `sortOrder`, `search`, `role`, `isActive`,
`isVerified`.

```bash
curl "$API/admin/users?role=CUSTOMER&isActive=true&page=1&limit=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

```json
{
  "success": true,
  "message": "Users fetched",
  "data": {
    "items": [
      {
        "id": "cmrt...",
        "name": "Nur Milon",
        "email": "customer@example.com",
        "phone": "01712345678",
        "avatar": null,
        "role": "CUSTOMER",
        "isActive": true,
        "emailVerifiedAt": "2026-07-20T11:17:00.934Z",
        "lastLoginAt": "2026-07-20T12:02:44.101Z",
        "createdAt": "2026-07-20T11:17:00.934Z"
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 43, "totalPages": 3, "hasNext": true, "hasPrev": false }
  }
}
```

`search` matches name, email and phone.

### `GET /admin/users/:id` — `ADMIN`, `SUPER_ADMIN`

### `PATCH /admin/users/:id/role` — **`SUPER_ADMIN` only**

```json
{ "role": "ADMIN" }
```

Accepts `SUPER_ADMIN`, `ADMIN`, `CUSTOMER`.

**Rejected with `400`:**

| Attempt | Why |
|---|---|
| Changing **your own** role | Self-demotion is unrecoverable without database access |
| Demoting the **last active** `SUPER_ADMIN` | Nobody would be left who can appoint another |
| Setting role to `SELLER` | Would leave a `SELLER` with no `Seller` row, which every seller-scoped query assumes exists. Use `POST /admin/sellers` |
| Changing a `SELLER`'s role | Would orphan their `Seller` row |

**Rejected with `403`:** an `ADMIN` calling this at all. If they could grant
roles, they could promote a second account of their own to `SUPER_ADMIN`.

### `PATCH /admin/users/:id/status` — `ADMIN`, `SUPER_ADMIN`

```json
{ "isActive": false }
```

Deactivating also **revokes every refresh token** for that user, so the session
cannot silently resume if the account is re-enabled.

Rejected with `400`: deactivating yourself, or the last active `SUPER_ADMIN`.

---

## Admin — seller management

Sellers are external suppliers. They get their own panel, but the storefront
never shows them — every product appears as Aydin Bazar's own.

### `POST /admin/sellers` — `ADMIN`, `SUPER_ADMIN`

```json
{
  "name": "Shop Owner",
  "email": "owner@shop.com",
  "shopName": "Aydin Fashion",
  "contactPhone": "01712345678",
  "contactName": "Karim",
  "contactEmail": "contact@shop.com",
  "address": "Mirpur, Dhaka",
  "commissionRate": 15,
  "bankAccountName": "Aydin Fashion",
  "bankAccountNumber": "1234567890",
  "bankName": "BRAC Bank",
  "bankBranch": "Mirpur",
  "bkashNumber": "01712345678"
}
```

`201 Created`. Creates the login account and the shop record in one transaction,
assigns the next sequential `code` (`SLR-0001`), and emails a
**set-your-password link**.

> **No password is sent by email.** The account is created with a random
> unusable one, and the seller chooses their own through the invite link. A
> mailed password sits in an inbox and in mail-server logs indefinitely.

The seller completes setup by posting the token to
`POST /auth/reset-password`, then logs in normally.

Errors: `409` email already registered · `400` validation.

### `GET /admin/sellers` — paginated, `status` filter, `search` over shop name / code / phone / email

### `GET /admin/sellers/:id`

### `PATCH /admin/sellers/:id`

Shop details **and** `commissionRate`. This is the only place the commission can
be set.

### `PATCH /admin/sellers/:id/status`

```json
{ "status": "SUSPENDED" }
```

`PENDING` · `APPROVED` · `SUSPENDED` · `REJECTED`. Setting `APPROVED` stamps
`approvedAt` and `approvedById`.

> **Not yet decided:** whether suspending a seller hides their products from the
> storefront. Either filter on `seller.status` in product queries or flip the
> products to `INACTIVE`. Settle this when the catalog module is built.

---

## Seller — own profile

`authorize(SELLER)`.

### `GET /seller/me`

### `PATCH /seller/me`

Editable: `shopName`, `contactName`, `contactPhone`, `contactEmail`, `address`,
and the bank/bKash payout fields.

> ⚠️ **`commissionRate`, `status` and `code` are not part of this schema.**
> Sending them changes nothing — Zod strips them before the service sees the
> request. A seller who could edit their own commission could set it to zero and
> keep the platform's entire cut.

---

## Account self-service

All under `/auth`, all requiring `authenticate`.

### `PATCH /auth/me`

```json
{ "name": "Updated Name", "phone": "01911111111" }
```

Both optional, at least one required. `email`, `role` and `isActive` are **not**
accepted here — sending `email` returns `400`.

### `POST /auth/change-email`

```json
{ "newEmail": "new@example.com", "password": "Str0ng!Pass1" }
```

Sends a verification link **to the new address**. The current password is
required, so a hijacked session cannot quietly move the account away.

> **`User.email` does not change yet.** The pending address lives on the token
> until it is confirmed. Committing first and verifying afterwards would mean a
> typo moves the account to an address nobody controls — unrecoverable, since
> both login and password reset key on email.

Errors: `401` wrong password · `409` address already in use · `400` same as
current.

### `POST /auth/verify-new-email`

```json
{ "token": "..." }
```

Commits the change. Public, because the link is opened from the new inbox, which
may not be the browser holding the session.

Uniqueness is re-checked here, not just at request time — someone else may have
registered the address in between.

### `GET /auth/sessions`

```json
{
  "success": true,
  "message": "Sessions fetched",
  "data": [
    {
      "id": "cmrt...",
      "userAgent": "Mozilla/5.0 ...",
      "ipAddress": "203.0.113.9",
      "createdAt": "2026-07-20T12:02:44.101Z",
      "expiresAt": "2026-08-19T12:02:44.101Z",
      "isCurrent": true
    }
  ]
}
```

`isCurrent` is computed by hashing your refresh cookie and comparing. The stored
hash itself is never returned.

### `DELETE /auth/sessions/:id`

Revokes one device. Scoped to your own sessions — someone else's id returns
`404`.

### `POST /auth/me/avatar` (multipart, field name `avatar`)

Max 2 MB, `image/*` only. Replacing an avatar deletes the previous file from
Cloudinary.

Returns `503` unless `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and
`CLOUDINARY_API_SECRET` are all set. The rest of the app runs fine without them.

```bash
curl -X POST "$API/auth/me/avatar" \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@./photo.jpg"
```

### `DELETE /auth/me/avatar`

---

## Addresses

`/api/v1/addresses`, all requiring `authenticate`. Every query is scoped to the
logged-in user.

| Route | Notes |
|---|---|
| `GET /addresses` | Default first, then newest |
| `POST /addresses` | |
| `GET /addresses/:id` | |
| `PATCH /addresses/:id` | Cannot set `isDefault` — use the route below |
| `PATCH /addresses/:id/default` | |
| `DELETE /addresses/:id` | |

```json
{
  "receiverName": "Nur Milon",
  "phone": "01712345678",
  "label": "Home",
  "division": "Dhaka",
  "district": "Dhaka",
  "upazila": "Savar",
  "area": "Bank Colony",
  "address": "House 1, Road 2",
  "postalCode": "1340",
  "isDefault": true
}
```

**Behaviours worth knowing:**

- The **first** address is always the default, regardless of `isDefault` — a
  customer with addresses but none selected would break checkout's pre-fill.
- Setting a default **clears the previous one in the same transaction**. The
  database has a partial unique index allowing only one default per user, so a
  second one would otherwise be rejected outright.
- Deleting the default **promotes the most recent survivor**.
- Another user's address id returns **`404`, not `403`** — so ids cannot be
  probed for existence.
- Deleting is safe for order history: `Order.addressId` is `SetNull` and each
  order carries its own `ship*` snapshot.

Division / district / upazila are free text — there is no reference table yet.

---

## Pagination

Every list endpoint accepts:

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | |
| `limit` | `20` | **Max 100.** Above that returns `400` |
| `sortBy` | varies | Restricted to an allow-list per endpoint; anything else falls back to the default |
| `sortOrder` | `desc` | `asc` or `desc` |
| `search` | — | Fields vary per endpoint |

The `sortBy` allow-list is deliberate: passing a raw user-supplied column into
the query would let a caller order by fields the endpoint never meant to expose.

Responses are always `{ items: [...], meta: {...} }`.

---

## Rate limits

**Disabled outside production**, so local testing and e2e runs are not throttled.

| Scope | Limit | Keyed on |
|---|---|---|
| `/auth/forgot-password`, `/auth/resend-verification` | 5 / hour | IP **+ target email** |
| `/auth/login`, `/auth/reset-password` | 10 / 15 min | IP + email |
| Everything under `/api/v1` | 300 / 15 min | IP |

The mail-sending limiters key on both IP and email on purpose: one IP alone
could otherwise spray many addresses, and an attacker rotating IPs could flood
one victim's inbox.

Exceeding a limit returns `429` in the standard error shape.

---

## Still open

- **Real email transport.** `src/lib/mailer.ts` prints to the console in
  development and logs a loud error in production. Seller invites and email
  changes both depend on it, so this now blocks more than signup.
- **Suspended-seller product visibility** — see the note under seller status.
- Social login · phone/OTP · per-permission custom roles.
