# Merony Hair.NG – Production Ecommerce Platform (v2)

**Beyond Hair. Behold Beauty.**  
Premium 100% Human Hair · Nigeria-first · International-ready architecture.

This project transforms the original single-file prototype into a secure, modular backend with PostgreSQL while **preserving the existing luxury Merony visual identity**.

---

## Status

| Area | Status |
|------|--------|
| Security (no client-side admin password, no default JWT) | ✅ Done |
| PostgreSQL schema + migrator + seed | ✅ Done |
| Modular Express API | ✅ Done |
| Customer auth (register/login JWT) | ✅ Done |
| Admin auth (JWT + RBAC roles) | ✅ Done |
| Products + variants + public catalog | ✅ Done |
| Cart (guest + authenticated + merge) | ✅ Done |
| Orders (server-calculated totals, stock reservation) | ✅ Done |
| Coupons (server-side validation) | ✅ Done |
| Wishlist | ✅ Done |
| Reviews + moderation | ✅ Done |
| Loyalty points (earn on paid order) | ✅ Done |
| Contact + email stub | ✅ Done |
| Shipping methods (configurable) | ✅ Done |
| Admin dashboard (real aggregates only) | ✅ Done |
| Inventory view + low-stock | ✅ Done |
| Frontend design preserved | ✅ Done |
| Frontend API client (`js/api.js`) | ✅ Done |
| **Paystack payments** | ⏸ Explicitly skipped (per request) |
| Cloudinary image upload | ⏳ Placeholder only |
| Full frontend SPA → API wiring | ⏳ Partial (admin login wired) |
| Automated tests | ⏳ Not yet |
| Production Docker | ⏳ Not yet |

---

## Architecture

```
Browser (Merony luxury UI)
    ↓
Express REST API  (Node 20+ ESM)
    ↓
PostgreSQL
    ↓
Email (console / Resend-ready) · Cloudinary (ready) · Paystack (deferred)
```

Roles: `customer` · `admin` · `manager` · `inventory_manager` · `support`

---

## Quick Start

### 1. Prerequisites
- Node.js ≥ 20
- PostgreSQL ≥ 14

### 2. Backend setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env:
#   JWT_SECRET=<long random string>
#   DATABASE_URL=postgresql://user:pass@localhost:5432/merony_hair_ng
#   ADMIN_EMAIL=admin@meronyhair.ng
#   ADMIN_PASSWORD_HASH=<bcrypt hash>
```

Generate admin hash:
```bash
node -e "console.log(require('bcryptjs').hashSync('YourStrongPass123!', 12))"
```

### 3. Database
```bash
createdb merony_hair_ng
npm run migrate    # applies migrations/001_initial_schema.sql
npm run seed       # roles, shipping, products, coupons, admin user
```

### 4. Run
```bash
npm run dev
# http://localhost:3000  → storefront + API
```

---

## API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health + DB connectivity |
| GET | `/api/products` | Active catalog |
| GET | `/api/products/:slugOrId` | Product + variants + images |
| GET | `/api/shipping` | Shipping methods |
| POST | `/api/coupons/validate` | Preview coupon discount |
| POST | `/api/contact` | Contact form |
| POST | `/api/auth/register` | Customer register |
| POST | `/api/auth/login` | Customer login |
| POST | `/api/auth/admin/login` | Admin login |

### Cart (guest or auth – send `X-Session-Id` header for guests)
| Method | Path |
|--------|------|
| GET | `/api/cart` |
| POST | `/api/cart/items` |
| PATCH | `/api/cart/items/:variantId` |
| DELETE | `/api/cart/items/:variantId` |
| POST | `/api/cart/merge` (auth) |

### Orders
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/orders` | Server calculates total; status `PENDING_PAYMENT` |
| GET | `/api/orders/:idOrNumber` | |
| GET | `/api/orders` | Manager+ |
| PATCH | `/api/orders/:id/status` | Manager+ |
| POST | `/api/orders/:id/mark-paid` | Manager+ (until Paystack) |

### Customer
| Method | Path |
|--------|------|
| GET/POST/DELETE | `/api/wishlist` … |
| GET | `/api/loyalty/me` |
| GET/POST | `/api/reviews` … |

### Admin (`Authorization: Bearer <token>`, role admin/manager)
| Method | Path |
|--------|------|
| GET | `/api/admin/dashboard` |
| GET | `/api/admin/analytics` |
| GET/POST | `/api/admin/products` |
| GET | `/api/admin/orders` |
| GET | `/api/admin/customers` |
| GET | `/api/admin/inventory` |
| GET | `/api/admin/messages` |
| GET | `/api/admin/coupons` |

---

## Order Flow (without Paystack)

1. Customer builds cart (guest or logged-in).
2. `POST /api/orders` with address + shipping method + optional coupon.
3. Server:
   - Locks variants
   - Validates stock
   - Reserves inventory
   - Calculates subtotal, discount, shipping, total
   - Creates order `PENDING_PAYMENT`
4. Admin (or future Paystack webhook) calls `POST /api/orders/:id/mark-paid`.
5. Reservations convert to sales, loyalty points awarded, payment row recorded.

**Never trust client prices or totals.**

---

## Security Notes

- No admin password in frontend source.
- JWT secret required in production (≥ 32 chars).
- bcrypt cost 12.
- Zod validation on inputs.
- Rate limits on auth + contact.
- RBAC enforced server-side.
- Parameterized SQL only.
- Analytics show only real aggregates (no fake conversion/uptime).

---

## Environment Variables

See `backend/.env.example`.

---

## What You Must Still Provide for Full Production

1. PostgreSQL instance + credentials
2. Strong `JWT_SECRET` and `ADMIN_PASSWORD_HASH`
3. Paystack keys (when you enable payments)
4. Cloudinary (or other) for product image uploads
5. Real email API key (Resend / SendGrid)
6. Production `CORS_ORIGIN` and HTTPS

---

## Design Preservation

The original Merony glassmorphism UI, gold palette, typography, product cards, hero, quiz, WhatsApp links, theme toggle and overall shopping experience remain in `frontend/index.html`.  
A progressive API client lives at `frontend/js/api.js` for gradual integration.

---

## License
MIT
