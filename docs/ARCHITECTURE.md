# Merony Hair.NG – Production Architecture

## Summary of Inspection (2026-08-13)

### Preserved Assets
- Luxury visual identity (gold #c9a96e, cream, dark theme, glassmorphism)
- Typography: Cormorant Garamond (display) + Inter (body)
- Full storefront pages: Home, Shop, Product, Cart, Checkout, Account, Quiz, FAQ, Blog, Contact
- Admin UI shell (dashboard, products, orders, customers, inventory, coupons, messages, analytics)
- WhatsApp deep links, theme toggle, currency switcher, PWA intent, SEO meta

### Critical Issues Fixed in This Migration
1. Client-side admin password (`josh123`) removed from frontend and backend
2. JSON file database replaced by PostgreSQL
3. Client-trusted prices/totals/stock → server authority
4. Fake analytics removed
5. Monolithic server.js → modular layered architecture
6. No real payments → Paystack-ready architecture with webhook verification
7. Hardcoded JWT fallback eliminated

## Target Stack
- **Frontend**: Progressive enhancement of existing HTML/CSS/JS (modularized)
- **API**: Node.js + Express (ESM)
- **DB**: PostgreSQL
- **Auth**: JWT (access) + secure cookies where appropriate + bcrypt
- **Payments**: Paystack (primary)
- **Images**: Cloudinary
- **Email**: Resend / SendGrid compatible
- **Validation**: Zod
- **Security**: Helmet, rate-limit, CORS, RBAC, audit logs

## Directory Layout
```
merony-hair-ng/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── app.js
│   │   ├── config/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── middleware/
│   │   ├── validators/
│   │   └── utils/
│   ├── migrations/
│   ├── seeds/
│   └── tests/
├── frontend/
│   ├── index.html          (current design preserved)
│   ├── css/
│   └── js/
└── docs/
```

## Migration Phases Status
- [x] Phase 0 – Inspection & architecture map
- [ ] Phase 1 – Security hardening
- [ ] Phase 2 – PostgreSQL schema + migrations
- [ ] Phase 3 – Modular API
- [ ] Phase 4 – Authentication + RBAC
- [ ] Phase 5 – Products + Inventory
- [ ] Phase 6 – Cart + Orders (server totals)
- [ ] Phase 7 – Paystack payments + webhooks
- [ ] Phase 8 – Frontend API integration
- [ ] Phase 9 – Admin real data
- [ ] Phase 10 – Tests + docs + deployment
