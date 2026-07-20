# Authentication API

Base URL: `http://localhost:5000/api/v1/auth`

> Login, registration and password flows are covered here. Profile updates,
> email change, session management, avatar upload, addresses, and the admin and
> seller surfaces live in [`admin.md`](./admin.md).

---

## Contents

1. [Quick start](#quick-start)
2. [How the token model works](#how-the-token-model-works)
3. [The signup flow](#the-signup-flow)
4. [Endpoint reference](#endpoint-reference)
5. [Response format](#response-format)
6. [Error reference](#error-reference)
7. [Validation rules](#validation-rules)
8. [Full test sequence (copy-paste)](#full-test-sequence-copy-paste)
9. [Testing in Postman / Thunder Client](#testing-in-postman--thunder-client)

---

## Quick start

```bash
npm run dev
```

First boot takes ~15 seconds (ts-node-dev compile + Prisma cold start), and the
very first request can take several seconds more. After that it is fast.

```bash
curl http://localhost:5000/api/v1/health
# {"success":true,"message":"API is running 🚀"}
```

> **No email is actually sent.** In development the mailer prints the message to
> the terminal running `npm run dev`. That is where you copy the verification
> and password-reset links from. See [the signup flow](#the-signup-flow).

---

## How the token model works

Two different tokens, deliberately handled differently:

| | Access token | Refresh token |
|---|---|---|
| **Format** | JWT | Opaque random string |
| **Lifetime** | 15 minutes | 30 days |
| **Sent as** | `Authorization: Bearer <token>` | httpOnly cookie |
| **Stored where** | Client memory | Browser cookie jar (JS cannot read it) |
| **Stored server-side** | Not stored | Yes, **hashed**, in `RefreshToken` |
| **Revocable** | No — valid until it expires | Yes, immediately |

**Why this split.** The access token is stateless, so it is fast to verify but
cannot be cancelled — which is why it is short-lived. The refresh token is a
database row, so logging out or banning a user takes effect instantly.

**The cookie is scoped to `/api/v1/auth`.** It is not attached to any other API
call. Only `/refresh`, `/logout`, `/logout-all`, `/change-password` and
`/reset-password` ever see it.

**Refresh tokens rotate.** Every call to `/refresh` revokes the token you
presented and issues a new one. A refresh token is therefore single-use — if
someone steals one, it stops working the moment either party uses it.

### What the client needs to do

1. On login, keep `accessToken` **in memory** (not `localStorage` — that is
   readable by any XSS payload). The refresh cookie is set automatically.
2. Send `Authorization: Bearer <accessToken>` on protected requests.
3. On a `401`, call `POST /refresh` once, then retry the original request.
4. If `/refresh` also returns `401`, the session is genuinely over — send the
   user to login.

---

## The signup flow

**Login is blocked until the email is verified.** A freshly registered user
cannot log in yet.

```
POST /register
      ↓
  verification email  ──►  terminal prints the link
      ↓
POST /verify-email  { token }
      ↓
POST /login   ← now works
```

### Getting the token in development

After `POST /register`, look at the terminal running `npm run dev`:

```
========================================================================
  EMAIL (not actually sent -- ConsoleMailer)
  To:      customer@example.com
  Subject: Verify your email address
------------------------------------------------------------------------
Hi Nur,

Verify your email to activate your account:

http://localhost:3000/verify-email?token=a1b2c3d4e5f6...
                                          ^^^^^^^^^^^^^^
                                          copy this part
========================================================================
```

Take the value after `token=` and send it to `POST /verify-email`.

> If the user never receives the email, `POST /resend-verification` issues a new
> link. Without it they would be permanently locked out — which is why that
> endpoint exists even though it is not in the "happy path".

---

## Endpoint reference

Legend: 🔓 public · 🔒 requires `Authorization: Bearer` · 🍪 uses the refresh cookie

---

### 🔓 `POST /register`

Creates the account and emails a verification link. **Returns no tokens** —
the user cannot log in until verified.

**Request**

```json
{
  "name": "Nur Milon",
  "email": "customer@example.com",
  "password": "Str0ng!Pass1",
  "phone": "01712345678"
}
```

`phone` is optional. Everything else is required.

**`201 Created`**

```json
{
  "success": true,
  "message": "Account created. Check your email for a verification link to activate it.",
  "data": {
    "id": "cmd8x2k1p0000v8lc9q2r4t7y",
    "name": "Nur Milon",
    "email": "customer@example.com",
    "phone": "01712345678",
    "avatar": null,
    "role": "CUSTOMER",
    "isEmailVerified": false,
    "createdAt": "2026-07-20T17:04:12.881Z"
  }
}
```

**Errors** — `409` email already registered · `400` validation

---

### 🔓 `POST /verify-email`

Consumes the token from the email and activates the account.

**Request**

```json
{ "token": "a1b2c3d4e5f6..." }
```

**`200 OK`** — same `data` shape as register, with `isEmailVerified: true`.

**Errors** — `400` invalid, expired, or already-used token

> Tokens are **single-use**. Calling this twice with the same token returns
> `400` the second time.

---

### 🔓 `POST /resend-verification`

Issues a new verification link and invalidates the previous one.

**Request**

```json
{ "email": "customer@example.com" }
```

**`200 OK`**

```json
{
  "success": true,
  "message": "If that email belongs to an unverified account, a new link is on its way."
}
```

> **Always returns `200`**, whether or not the address exists or is already
> verified. Reporting the difference would let anyone test which emails are
> registered.

---

### 🔓 `POST /login`

**Request**

```json
{
  "email": "customer@example.com",
  "password": "Str0ng!Pass1"
}
```

**`200 OK`** — sets the refresh cookie and returns the access token.

```
Set-Cookie: refreshToken=...; HttpOnly; Path=/api/v1/auth; Max-Age=2592000
```

```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "user": {
      "id": "cmd8x2k1p0000v8lc9q2r4t7y",
      "name": "Nur Milon",
      "email": "customer@example.com",
      "phone": "01712345678",
      "avatar": null,
      "role": "CUSTOMER",
      "isEmailVerified": true,
      "createdAt": "2026-07-20T17:04:12.881Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors**

| Code | When | Message |
|---|---|---|
| `401` | Wrong password **or** unknown email | `Invalid email or password` |
| `403` | Email not verified | `Please verify your email address before logging in...` |
| `403` | Account deactivated | `This account has been deactivated` |
| `400` | Validation | `Validation Error` |

> A wrong password and an unknown email produce the **identical** `401`, and take
> the same amount of time. Neither the message nor the response latency reveals
> whether an address is registered.

---

### 🔓🍪 `POST /refresh`

Reads the refresh cookie, rotates it, and issues a new access token. **No
request body.**

**`200 OK`** — same `data` shape as login, plus a **new** refresh cookie.

**Errors**

| Code | When |
|---|---|
| `401` | No cookie sent (`No active session`) |
| `401` | Token revoked, expired, or already rotated |
| `403` | Account deactivated |

> Presenting an **already-rotated** token returns `401`. This is intentional —
> each refresh token works exactly once.

---

### 🔓🍪 `POST /logout`

Revokes the current refresh token and clears the cookie. No body.

**`200 OK`** — always succeeds, even with no cookie or an already-dead token.

---

### 🔒🍪 `POST /logout-all`

Revokes **every** refresh token for the user — logs out all devices.

**Headers** — `Authorization: Bearer <accessToken>`

**`200 OK`**

> Access tokens already issued stay valid for up to 15 minutes. To cut every
> session dead *immediately*, use `change-password`, which stamps
> `passwordChangedAt` and invalidates access tokens too.

---

### 🔓 `POST /forgot-password`

**Request**

```json
{ "email": "customer@example.com" }
```

**`200 OK`**

```json
{
  "success": true,
  "message": "If that email belongs to an account, a reset link is on its way."
}
```

> **Always `200`**, same reasoning as resend-verification. Check the terminal
> for the link.

---

### 🔓 `POST /reset-password`

**Request**

```json
{
  "token": "f6e5d4c3b2a1...",
  "password": "N3wStr0ng!Pass"
}
```

**`200 OK`**

**Errors** — `400` invalid/expired token · `400` account has no password (social-only login) · `400` validation

> This **logs out every session**, including the attacker's if the account was
> compromised. A reset that leaves an intruder's session alive has not actually
> recovered the account.

---

### 🔒 `POST /change-password`

**Headers** — `Authorization: Bearer <accessToken>`

**Request**

```json
{
  "currentPassword": "Str0ng!Pass1",
  "newPassword": "N3wStr0ng!Pass"
}
```

**`200 OK`**

```json
{
  "success": true,
  "message": "Password changed. All sessions have been logged out, please log in again."
}
```

**Errors** — `401` current password wrong · `401` not authenticated · `400` validation

> ⚠️ **The access token you just used stops working immediately.** Changing a
> password stamps `passwordChangedAt`, and every token issued before that instant
> is rejected — including the one that made this request. The client must send
> the user back to login.

---

### 🔒 `GET /me`

**Headers** — `Authorization: Bearer <accessToken>`

**`200 OK`**

```json
{
  "success": true,
  "message": "Profile fetched",
  "data": {
    "id": "cmd8x2k1p0000v8lc9q2r4t7y",
    "name": "Nur Milon",
    "email": "customer@example.com",
    "phone": "01712345678",
    "avatar": null,
    "role": "CUSTOMER",
    "isEmailVerified": true,
    "createdAt": "2026-07-20T17:04:12.881Z"
  }
}
```

**Errors** — `401` missing/invalid/expired token · `403` deactivated

---

## Response format

Every response uses one of two shapes.

**Success**

```json
{ "success": true, "message": "...", "data": { } }
```

`data` is omitted when there is nothing to return.

**Error**

```json
{ "success": false, "message": "...", "errors": [ ], "stack": "..." }
```

- `errors` appears only for validation failures.
- `stack` appears only when `NODE_ENV !== "production"`.

**Validation error example**

```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [
    {
      "origin": "string",
      "code": "too_small",
      "minimum": 2,
      "inclusive": true,
      "path": ["body", "name"],
      "message": "Name must be at least 2 characters"
    }
  ]
}
```

All failing fields are returned at once, not one at a time.

> `path` starts with `"body"` because schemas are wrapped as
> `z.object({ body: ... })`. Strip the first element to map an error onto a form
> field.

---

## Error reference

| Code | Meaning | What the client should do |
|---|---|---|
| `400` | Validation failed, or a bad/expired email token | Show field errors, or ask for a new link |
| `401` | Not authenticated, or credentials rejected | Try `/refresh` once; if that fails, log in again |
| `403` | Authenticated but not allowed | Email unverified → offer resend. Deactivated → contact support |
| `404` | Route or record not found | — |
| `409` | Conflict — email already registered | Suggest logging in instead |
| `500` | Server error | Real cause is logged server-side, never returned |

---

## Validation rules

| Field | Rule |
|---|---|
| `name` | 2–100 characters, trimmed |
| `email` | Valid email, lowercased and trimmed automatically |
| `password` | 8–72 characters; must contain lowercase, uppercase, a digit, and one of `@$!%*?&` |
| `phone` | Optional. Bangladeshi mobile: `01[3-9]` followed by 8 digits (e.g. `01712345678`) |

> The 72-character ceiling is not arbitrary — bcrypt silently truncates beyond
> 72 bytes, so anything longer would give a false sense of strength.

**Valid password examples:** `Str0ng!Pass1` · `Aydin@2026` · `N3w!Password`

---

## Full test sequence (copy-paste)

Run these in order with the server running in another terminal.

```bash
API=http://localhost:5000/api/v1/auth
JAR=/tmp/cookies.txt
rm -f $JAR

# 1. Register
curl -s -X POST $API/register -H "Content-Type: application/json" -d '{
  "name": "Nur Milon",
  "email": "customer@example.com",
  "password": "Str0ng!Pass1",
  "phone": "01712345678"
}' | jq

# 2. Login BEFORE verifying -> 403, this is expected
curl -s -X POST $API/login -H "Content-Type: application/json" -d '{
  "email": "customer@example.com", "password": "Str0ng!Pass1"
}' | jq

# 3. Copy the token from the `npm run dev` terminal, then:
TOKEN=<paste-token-here>
curl -s -X POST $API/verify-email -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}" | jq

# 4. Login -> now works. -c stores the refresh cookie.
ACCESS=$(curl -s -c $JAR -X POST $API/login -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","password":"Str0ng!Pass1"}' \
  | jq -r .data.accessToken)
echo "access token: ${ACCESS:0:40}..."

# 5. Protected route
curl -s $API/me -H "Authorization: Bearer $ACCESS" | jq

# 6. Without a token -> 401
curl -s $API/me | jq

# 7. Refresh (rotates the cookie). -b sends it, -c saves the new one.
curl -s -b $JAR -c $JAR -X POST $API/refresh | jq

# 8. Change password -> logs out everything
curl -s -b $JAR -X POST $API/change-password \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"currentPassword":"Str0ng!Pass1","newPassword":"N3wStr0ng!Pass"}' | jq

# 9. The token from step 4 is now dead -> 401
curl -s $API/me -H "Authorization: Bearer $ACCESS" | jq

# 10. Forgot password -> check the terminal for the new link
curl -s -X POST $API/forgot-password -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com"}' | jq

# 11. Reset with that token
RESET=<paste-reset-token-here>
curl -s -X POST $API/reset-password -H "Content-Type: application/json" \
  -d "{\"token\":\"$RESET\",\"password\":\"Str0ng!Pass1\"}" | jq

# 12. Logout
curl -s -b $JAR -c $JAR -X POST $API/logout | jq
```

`jq` just pretty-prints — drop it if you do not have it installed.

---

## Testing in Postman / Thunder Client

**Cookies are handled for you.** Both clients keep a cookie jar automatically,
so `/refresh`, `/logout` and friends work with no extra setup.

**Automate the access token** so you are not pasting it into every request.
Add this to the **Tests / Post-response** script on the login request:

```javascript
const res = pm.response.json();
if (res.data?.accessToken) {
  pm.environment.set("accessToken", res.data.accessToken);
}
```

Then set the collection's Authorization to **Bearer Token** with value
`{{accessToken}}`, and every protected request inherits it.

**Suggested environment variables**

| Variable | Value |
|---|---|
| `baseUrl` | `http://localhost:5000/api/v1` |
| `accessToken` | *(set by the script above)* |

---

## Things to know before production

**Rate limiting is in place** — see [`admin.md`](./admin.md#rate-limits).
`/forgot-password` and `/resend-verification` allow 5 per hour keyed on IP **and**
target email; `/login` and `/reset-password` allow 10 per 15 minutes. Limits are
**disabled outside production**, so local testing is not throttled.

**No real email transport yet.** `src/lib/mailer.ts` prints to the console in
development and logs a loud error in production rather than failing silently.
Implement `send()` with your provider — nothing else in the auth code changes.
This now blocks more than signup: seller invites and email changes depend on it
too.

Also worth knowing:

- **Social login is not built**, but the schema supports it: `Account.provider`
  already has `GOOGLE` and `FACEBOOK`, so adding it needs no migration.
- **`requireVerified` middleware exists** in `src/middlewares/auth.middleware.ts`
  and is unused so far. Mount it on checkout when you build it — login already
  requires verification, but this keeps that guarantee if the login policy is
  ever relaxed.
- **Roles are `SUPER_ADMIN` / `ADMIN` / `SELLER` / `CUSTOMER`.** Guard routes
  with `authorize("ADMIN", "SUPER_ADMIN")` after `authenticate`. Role and status
  changes take effect on the very next request — `authenticate` reads both from
  the database, not from the JWT claim.
- **Seller accounts never log in with a mailed password.** `POST /admin/sellers`
  emails a set-your-password link that is consumed by `POST /auth/reset-password`.
