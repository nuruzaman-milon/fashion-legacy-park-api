# Cart & Wishlist API

Base URL: `http://localhost:5000/api/v1`

Both require login — there is no guest cart or guest wishlist, by design. Every
query is scoped to the authenticated user.

---

## Design decisions

Three choices shape everything below:

| Decision | Consequence |
|---|---|
| **Prices are the variant's current price** | No flash-sale or coupon logic yet. When the Promotions module lands, the resolver plugs in at `evaluate()` in `cart.service.ts` |
| **No stock reservation** | Adding to a cart holds nothing. `reservedStock` stays 0 until the order module reserves at checkout. Two customers can both hold the last unit in their carts |
| **Unavailable items stay, flagged** | The cart never silently drops a line. The customer sees *what* changed and *why* |

That last one is the one you feel most as a user: if a wishlisted item sells out
and simply vanishes from the cart, the customer assumes the site lost it.

---

## Cart

### `GET /cart`

Created automatically on first access — no separate "create cart" call.

```json
{
  "success": true,
  "message": "Cart fetched",
  "data": {
    "id": "cmrt...",
    "items": [
      {
        "id": "cmrt...",
        "quantity": 2,
        "unitPrice": "800",
        "lineTotal": "1600",
        "isAvailable": true,
        "unavailableReason": null,
        "maxQuantity": 5,
        "priceChanged": true,
        "priceDropped": true,
        "addedPrice": "1000",
        "variant": {
          "id": "cmrt...", "name": "Red", "sku": "CP-RED-A1B2",
          "price": "800", "comparePrice": null, "weight": null, "available": 5
        },
        "product": {
          "id": "cmrt...", "name": "Kurti", "slug": "kurti",
          "image": "https://res.cloudinary.com/.../red.jpg"
        },
        "createdAt": "2026-07-20T13:40:12.881Z"
      }
    ],
    "summary": {
      "itemCount": 1,
      "totalQuantity": 2,
      "subtotal": "1600",
      "unavailableCount": 0,
      "hasUnavailableItems": false
    }
  }
}
```

Every write endpoint returns the **whole cart** in the same shape, so the client
never needs a follow-up `GET` to refresh badge counts or totals.

### Availability

Computed on every read, never stored — stock, prices and product status all move
independently of the cart, so a cached flag would be wrong within seconds.

| `unavailableReason` | Meaning |
|---|---|
| `PRODUCT_UNAVAILABLE` | Product is no longer `ACTIVE` |
| `SELLER_UNAVAILABLE` | Its supplier was suspended |
| `VARIANT_INACTIVE` | That size/colour was switched off |
| `OUT_OF_STOCK` | Nothing left |
| `INSUFFICIENT_STOCK` | Fewer left than the quantity in the cart |

- **`subtotal` counts only available lines**, so it always matches what checkout
  would actually charge.
- **`maxQuantity`** is what the client should clamp its quantity stepper to.
- `hasUnavailableItems` is the flag to block the checkout button on.

### `POST /cart/items`

```json
{ "variantId": "cmrt...", "quantity": 2 }
```

`201`, returns the full cart.

> **Adding the same variant again tops up the existing line** rather than
> creating a second one — `(cartId, variantId)` is unique, so a second insert
> would fail. The error message accounts for what is already there:
> *"Only 3 left; you already have 2 in your cart"*.

Unlike an item that goes bad while sitting in the cart, **adding** something
unbuyable is rejected outright (`400`): out of stock, inactive variant,
withdrawn product, or suspended seller.

### `PATCH /cart/items/:id`

```json
{ "quantity": 3 }
```

`400` if it exceeds available stock. **Quantity `0` is rejected** — removing is
`DELETE`, so a `0` is almost always a client bug.

### `DELETE /cart/items/:id` · `DELETE /cart`

### `DELETE /cart/unavailable`

Removes every unbuyable line in one action, for a "clear unavailable items"
button.

```json
{ "success": true, "message": "2 unavailable item(s) removed", "data": { } }
```

### `POST /cart/items/:id/move-to-wishlist`

Saves for later. The wishlist is product-level, so the variant choice is
dropped; adding the same product from two variants collapses to one entry.

---

## Wishlist

Product-level, not variant-level — a customer hearts *a product*, not "Red / L".

### `GET /wishlist`

Paginated. Each entry carries `isPurchasable` and `isInStock` so a withdrawn
product can be shown greyed out rather than silently disappearing.

### `POST /wishlist`

```json
{ "productId": "cmrt..." }
```

**Idempotent** — adding twice returns `201` again, not `409`. Double-clicking a
heart icon is normal behaviour, not an error.

### `POST /wishlist/:productId/toggle`

For the heart icon. Returns the resulting state:

```json
{ "success": true, "message": "Added to wishlist", "data": { "wishlisted": true } }
```

### `POST /wishlist/:productId/move-to-cart`

```json
{ "variantId": "cmrt...", "quantity": 1 }
```

**`variantId` is required.** The wishlist is product-level and the cart is
variant-level, and there is no safe default — picking the cheapest or first
variant would be guessing at the customer's size or colour.

Two things happen in order:

1. The variant is checked to actually belong to that product (`400` otherwise).
   Without this, a crafted request could add *any* variant in the catalogue by
   pairing it with a wishlisted product.
2. The cart's own `addItem` runs, so every stock and availability rule applies
   here too. The wishlist entry is removed **only after** the cart accepts it —
   removing first would lose the entry if the item turned out to be sold out.

### `DELETE /wishlist/:productId`

`404` if it is not on your wishlist.

---

## Isolation

Verified in the e2e suite:

| Attempt | Result |
|---|---|
| No token | `401` |
| Another customer's cart line by id (read/edit/delete) | `404`, not `403` — ids must not be probeable |
| Removing a product that is not on your wishlist | `404` |
| Adding a variant from a suspended seller | `400` |

---

## Price changes

`CartItem.addedPrice` records what the variant cost when it went in. It is
**informational only** — the cart always charges the current price.

```json
{ "unitPrice": "800", "addedPrice": "1000",
  "priceChanged": true, "priceDropped": true }
```

Useful for "the price dropped since you added this", which is otherwise
undetectable: the cart deliberately does not snapshot price, because it should
always reflect what the customer would actually pay.

---

## Known gaps

1. **No stock reservation.** Two customers can both hold the last unit. The race
   is resolved at checkout by the order module, which is where reservation
   belongs — holding stock from add-to-cart means abandoned carts freeze
   inventory and need an expiry sweep.
2. **No flash-sale or coupon pricing.** Cart totals will change once Promotions
   lands. The resolver hooks into `evaluate()` in `cart.service.ts`.
3. **No abandoned-cart recovery.** `Cart` has no `expiresAt`, so stale carts
   accumulate.
4. **No "save for later" list** distinct from the wishlist.

---

## Next

Cart was the gateway to the order flow. Now unblocked:

**Order & Checkout** → Payment, Shipment, Returns, Reviews, and the seller
earnings half of the supplier portal (`SellerLedger` / `Payout`).

Checkout is where stock reservation, coupon application and flash-sale pricing
all land, so the Promotions module is worth doing either just before or
alongside it.
