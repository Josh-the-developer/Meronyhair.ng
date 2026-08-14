/**
 * Seed roles, shipping methods, sample categories and products
 * derived from the original Merony Hair.NG catalog.
 *
 * Usage: node src/utils/seed.js
 * Requires DATABASE_URL and a running PostgreSQL with schema applied.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, query } from "../config/db.js";
import { slugify } from "./slug.js";
import { config } from "../config/index.js";

const ROLES = [
  { name: "customer", description: "Store customer" },
  { name: "admin", description: "Full platform administrator" },
  { name: "manager", description: "Products, orders, customers, analytics" },
  { name: "inventory_manager", description: "Inventory and product stock" },
  { name: "support", description: "Customers, orders, messages" },
];

const CATEGORIES = [
  { name: "Bundles", slug: "bundles" },
  { name: "Wigs", slug: "wigs" },
  { name: "Closures", slug: "closures" },
  { name: "Frontals", slug: "frontals" },
];

const SHIPPING = [
  {
    name: "Standard Delivery (Lagos)",
    code: "standard_lagos",
    description: "2–4 business days within Lagos",
    base_price: 2500,
    estimated_days_min: 2,
    estimated_days_max: 4,
  },
  {
    name: "Express Delivery (Lagos)",
    code: "express_lagos",
    description: "Next business day within Lagos",
    base_price: 4500,
    estimated_days_min: 1,
    estimated_days_max: 1,
  },
  {
    name: "Nationwide Standard",
    code: "nationwide",
    description: "3–7 business days outside Lagos",
    base_price: 4500,
    estimated_days_min: 3,
    estimated_days_max: 7,
  },
  {
    name: "Store Pickup",
    code: "pickup",
    description: "Pick up from our Lagos location",
    base_price: 0,
    estimated_days_min: 0,
    estimated_days_max: 1,
  },
];

/** Original catalog converted into products + default variants */
const CATALOG = [
  {
    name: "Silky Straight Bundle",
    cat: "Bundles",
    texture: "Straight",
    length: 18,
    color: "Natural Black",
    price: 45000,
    oldPrice: 52000,
    stock: 24,
    badge: "Bestseller",
    density: "150%",
    desc: "Premium 100% human hair, double drawn, tangle-free. Soft, silky and long-lasting.",
    img: "https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600&q=80",
    tags: ["virgin", "double-drawn"],
  },
  {
    name: "Body Wave Bundle Set",
    cat: "Bundles",
    texture: "Body Wave",
    length: 20,
    color: "Natural Black",
    price: 52000,
    oldPrice: 60000,
    stock: 18,
    badge: "Popular",
    density: "150%",
    desc: "Soft body wave texture that holds curls beautifully and blends with most natural hair.",
    img: "https://images.unsplash.com/photo-1522338242992-e1a74e2b7ded?w=600&q=80",
    tags: ["virgin"],
  },
  {
    name: "HD Lace Frontal Wig",
    cat: "Wigs",
    texture: "Straight",
    length: 22,
    color: "Natural Black",
    price: 125000,
    oldPrice: 145000,
    stock: 9,
    badge: "New",
    density: "180%",
    lace: "HD",
    desc: "Ultra-thin HD lace, pre-plucked, glueless ready. Undetectable hairline.",
    img: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=600&q=80",
    tags: ["hd-lace", "glueless"],
  },
  {
    name: "Deep Wave Closure",
    cat: "Closures",
    texture: "Deep Wave",
    length: 16,
    color: "Natural Black",
    price: 28000,
    oldPrice: 32000,
    stock: 32,
    density: "130%",
    lace: "Transparent",
    desc: "4x4 transparent lace closure with deep wave pattern. Perfect match for bundles.",
    img: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=600&q=80",
    tags: ["4x4"],
  },
  {
    name: "Curly 13x4 Frontal",
    cat: "Frontals",
    texture: "Curly",
    length: 18,
    color: "Natural Black",
    price: 48000,
    oldPrice: 55000,
    stock: 14,
    density: "150%",
    lace: "HD",
    desc: "13x4 HD lace frontal with bouncy curls. Pre-plucked and bleached knots.",
    img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&q=80",
    tags: ["13x4", "pre-plucked"],
  },
  {
    name: "Kinky Curly Bundle",
    cat: "Bundles",
    texture: "Kinky Curly",
    length: 18,
    color: "Natural Black",
    price: 48000,
    oldPrice: 55000,
    stock: 15,
    density: "150%",
    desc: "Natural kinky curly texture that blends seamlessly with afro-textured hair.",
    img: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=600&q=80",
    tags: ["virgin", "afro"],
  },
  {
    name: "Glueless Bob Wig",
    cat: "Wigs",
    texture: "Straight",
    length: 12,
    color: "Natural Black",
    price: 85000,
    oldPrice: 98000,
    stock: 11,
    badge: "Popular",
    density: "150%",
    lace: "HD",
    desc: "Ready-to-wear glueless bob. Pre-plucked, elastic band, beginner friendly.",
    img: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&q=80",
    tags: ["glueless", "bob"],
  },
  {
    name: "Water Wave Bundle",
    cat: "Bundles",
    texture: "Water Wave",
    length: 22,
    color: "Natural Black",
    price: 55000,
    oldPrice: 62000,
    stock: 20,
    density: "150%",
    desc: "Soft water wave pattern with natural movement and shine.",
    img: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80",
    tags: ["virgin"],
  },
];

async function seedRoles() {
  for (const r of ROLES) {
    await query(
      `INSERT INTO roles (name, description) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [r.name, r.description]
    );
  }
  console.log("Roles seeded");
}

async function seedCategories() {
  const map = {};
  for (const c of CATEGORIES) {
    const { rows } = await query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, slug`,
      [c.name, c.slug]
    );
    map[c.name] = rows[0].id;
  }
  console.log("Categories seeded");
  return map;
}

async function seedShipping() {
  for (const s of SHIPPING) {
    await query(
      `INSERT INTO shipping_methods
         (name, code, description, base_price, estimated_days_min, estimated_days_max)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         base_price = EXCLUDED.base_price,
         is_active = true`,
      [s.name, s.code, s.description, s.base_price, s.estimated_days_min, s.estimated_days_max]
    );
  }
  console.log("Shipping methods seeded");
}

async function seedAdmin() {
  const email = config.admin.email || "admin@meronyhair.ng";
  let hash = config.admin.passwordHash;
  if (!hash) {
    // Development default – change immediately in production
    hash = await bcrypt.hash("ChangeMeAdmin123!", 12);
    console.warn("No ADMIN_PASSWORD_HASH set – using temporary password: ChangeMeAdmin123!");
  }

  const role = await query(`SELECT id FROM roles WHERE name = 'admin'`);
  const roleId = role.rows[0]?.id;
  if (!roleId) throw new Error("Admin role missing");

  const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows.length) {
    await query(`UPDATE users SET password_hash = $1, role_id = $2, is_active = true WHERE email = $3`, [
      hash,
      roleId,
      email,
    ]);
    console.log(`Admin user updated: ${email}`);
  } else {
    await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, email_verified, is_active)
       VALUES ($1, $2, 'Merony', 'Admin', $3, true, true)`,
      [email, hash, roleId]
    );
    console.log(`Admin user created: ${email}`);
  }
}

async function seedProducts(categoryMap) {
  let created = 0;
  for (const item of CATALOG) {
    const slug = slugify(item.name);
    const catId = categoryMap[item.cat];

    const existing = await query(`SELECT id FROM products WHERE slug = $1`, [slug]);
    if (existing.rows.length) continue;

    const { rows } = await query(
      `INSERT INTO products (
         name, slug, short_description, description, category_id,
         base_price, compare_at_price, status, is_featured,
         texture, density, lace_type, hair_type, tags
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,$11,'100% Human Hair',$12)
       RETURNING id`,
      [
        item.name,
        slug,
        item.desc?.slice(0, 160),
        item.desc,
        catId,
        item.price,
        item.oldPrice || null,
        Boolean(item.badge),
        item.texture,
        item.density || null,
        item.lace || null,
        item.tags || [],
      ]
    );
    const productId = rows[0].id;

    // Default variant
    const sku = `MH-${slug.slice(0, 12).toUpperCase().replace(/-/g, "")}-${item.length}`;
    await query(
      `INSERT INTO product_variants (
         product_id, sku, name, length_inches, color, density, lace_type,
         price, compare_at_price, stock_quantity, low_stock_threshold
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,5)`,
      [
        productId,
        sku,
        `${item.length}" / ${item.color}`,
        item.length,
        item.color,
        item.density || null,
        item.lace || null,
        item.price,
        item.oldPrice || null,
        item.stock,
      ]
    );

    if (item.img) {
      await query(
        `INSERT INTO product_images (product_id, url, alt_text, is_primary, sort_order)
         VALUES ($1, $2, $3, true, 0)`,
        [productId, item.img, item.name]
      );
    }
    created++;
  }
  console.log(`Products seeded: ${created} new`);
}

async function seedCoupons() {
  const coupons = [
    { code: "WELCOME10", type: "percentage", value: 10, min: 30000, max: 15000 },
    { code: "LUXE15", type: "percentage", value: 15, min: 80000, max: 30000 },
  ];
  for (const c of coupons) {
    await query(
      `INSERT INTO coupons (code, type, value, min_order_amount, max_discount, usage_limit, is_active)
       VALUES ($1,$2,$3,$4,$5,1000,true)
       ON CONFLICT (code) DO NOTHING`,
      [c.code, c.type, c.value, c.min, c.max]
    );
  }
  console.log("Coupons seeded");
}

async function main() {
  try {
    await seedRoles();
    const categoryMap = await seedCategories();
    await seedShipping();
    await seedAdmin();
    await seedProducts(categoryMap);
    await seedCoupons();
    console.log("Seed completed successfully");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
