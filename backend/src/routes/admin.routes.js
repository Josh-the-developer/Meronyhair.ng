import { Router } from "express";
import { authenticate, requireAdmin, requireManager, requireInventory } from "../middleware/auth.js";
import { query } from "../config/db.js";
import * as productRepo from "../repositories/product.repository.js";
import { z } from "zod";
import { slugify } from "../utils/slug.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

// All admin routes require authentication first
router.use(authenticate);

/**
 * GET /api/admin/dashboard
 */
router.get("/dashboard", requireManager, async (req, res, next) => {
  try {
    const revenueRes = await query(
      `SELECT COALESCE(SUM(total),0)::numeric AS revenue
       FROM orders WHERE payment_status = 'paid'`
    );
    const ordersRes = await query(`SELECT COUNT(*)::int AS c FROM orders`);
    const pendingRes = await query(
      `SELECT COUNT(*)::int AS c FROM orders WHERE status IN ('PENDING_PAYMENT','PAID','PROCESSING')`
    );
    const productsRes = await query(`SELECT COUNT(*)::int AS c FROM products WHERE status = 'active'`);
    const customersRes = await query(
      `SELECT COUNT(*)::int AS c FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'customer'`
    );
    const lowStockRes = await query(
      `SELECT COUNT(*)::int AS c FROM product_variants
       WHERE is_active AND (stock_quantity - reserved_quantity) <= low_stock_threshold`
    );
    const todayRes = await query(
      `SELECT COALESCE(SUM(total),0)::numeric AS today
       FROM orders WHERE payment_status = 'paid' AND paid_at::date = CURRENT_DATE`
    );

    const revenue = Number(revenueRes.rows[0].revenue);
    const totalOrders = ordersRes.rows[0].c;
    const paidOrders = await query(
      `SELECT COUNT(*)::int AS c FROM orders WHERE payment_status = 'paid'`
    );

    res.json({
      success: true,
      data: {
        revenue,
        todaySales: Number(todayRes.rows[0].today),
        totalOrders,
        pendingOrders: pendingRes.rows[0].c,
        products: productsRes.rows[0].c,
        customers: customersRes.rows[0].c,
        lowStock: lowStockRes.rows[0].c,
        avgOrderValue: paidOrders.rows[0].c
          ? Math.round(revenue / paidOrders.rows[0].c)
          : 0,
        // Clearly labeled: no fake conversion rate
        note: "Conversion rate requires traffic analytics (not available in core DB).",
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/analytics
 * Only real aggregates
 */
router.get("/analytics", requireManager, async (req, res, next) => {
  try {
    const revenueRes = await query(
      `SELECT COALESCE(SUM(total),0)::numeric AS revenue FROM orders WHERE payment_status = 'paid'`
    );
    const paidCount = await query(
      `SELECT COUNT(*)::int AS c FROM orders WHERE payment_status = 'paid'`
    );
    const repeatRes = await query(
      `SELECT COUNT(*)::int AS c FROM (
         SELECT user_id FROM orders
         WHERE payment_status = 'paid' AND user_id IS NOT NULL
         GROUP BY user_id HAVING COUNT(*) > 1
       ) t`
    );
    const customersRes = await query(
      `SELECT COUNT(DISTINCT user_id)::int AS c FROM orders WHERE user_id IS NOT NULL`
    );
    const topProducts = await query(
      `SELECT oi.product_name, SUM(oi.quantity)::int AS units, SUM(oi.line_total)::numeric AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.payment_status = 'paid'
       GROUP BY oi.product_name
       ORDER BY units DESC
       LIMIT 10`
    );

    const revenue = Number(revenueRes.rows[0].revenue);
    const paid = paidCount.rows[0].c;
    const customersWithOrders = customersRes.rows[0].c || 1;

    res.json({
      success: true,
      data: {
        revenue,
        avgOrder: paid ? Math.round(revenue / paid) : 0,
        paidOrders: paid,
        repeatPurchaseRate: customersWithOrders
          ? Math.round((repeatRes.rows[0].c / customersWithOrders) * 1000) / 10
          : 0,
        topProducts: topProducts.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Product management
 */
router.get("/products", requireManager, async (req, res, next) => {
  try {
    const products = await productRepo.findAllProducts({
      status: req.query.status || null,
      limit: 200,
      offset: 0,
    });
    res.json({ success: true, data: products, count: products.length });
  } catch (err) {
    next(err);
  }
});

router.post("/products", requireManager, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      short_description: z.string().optional(),
      category_id: z.coerce.number().optional(),
      base_price: z.coerce.number().min(0),
      compare_at_price: z.coerce.number().optional(),
      texture: z.string().optional(),
      density: z.string().optional(),
      lace_type: z.string().optional(),
      status: z.enum(["draft", "active", "archived"]).default("active"),
      is_featured: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      variants: z
        .array(
          z.object({
            length_inches: z.coerce.number().optional(),
            color: z.string().optional(),
            price: z.coerce.number().min(0),
            stock_quantity: z.coerce.number().int().min(0).default(0),
            sku: z.string().optional(),
          })
        )
        .optional(),
      image_url: z.string().url().optional(),
    });
    const data = schema.parse(req.body);
    const slug = slugify(data.name);

    const product = await productRepo.createProduct({
      ...data,
      slug,
      sku_base: slug.slice(0, 20).toUpperCase(),
    });

    // Default variant if none provided
    const variants = data.variants?.length
      ? data.variants
      : [{ price: data.base_price, stock_quantity: 0, color: "Natural Black" }];

    for (const v of variants) {
      const sku =
        v.sku ||
        `MH-${product.id}-${v.length_inches || "STD"}-${Date.now().toString(36).slice(-4)}`.toUpperCase();
      await query(
        `INSERT INTO product_variants
           (product_id, sku, name, length_inches, color, price, stock_quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          product.id,
          sku,
          [v.length_inches ? `${v.length_inches}"` : null, v.color].filter(Boolean).join(" / "),
          v.length_inches || null,
          v.color || null,
          v.price,
          v.stock_quantity ?? 0,
        ]
      );
    }

    if (data.image_url) {
      await query(
        `INSERT INTO product_images (product_id, url, alt_text, is_primary)
         VALUES ($1, $2, $3, true)`,
        [product.id, data.image_url, data.name]
      );
    }

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ success: false, message: "Validation failed", errors: err.errors });
    }
    next(err);
  }
});

router.get("/orders", requireManager, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

router.get("/customers", requireManager, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
              u.created_at, u.last_login_at,
              COALESCE(la.points_balance, 0) AS points,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
              (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS lifetime_value
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN loyalty_accounts la ON la.user_id = u.id
       WHERE r.name = 'customer'
       ORDER BY u.created_at DESC
       LIMIT 200`
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

router.get("/inventory", requireInventory, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT pv.*, p.name AS product_name, p.slug,
              (pv.stock_quantity - pv.reserved_quantity) AS available
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       ORDER BY available ASC, p.name`
    );
    const low = rows.filter((r) => r.available <= r.low_stock_threshold);
    const out = rows.filter((r) => r.available <= 0);
    res.json({
      success: true,
      data: {
        total: rows.length,
        lowStock: low.length,
        outOfStock: out.length,
        variants: rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/messages", requireManager, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

router.get("/coupons", requireManager, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM coupons ORDER BY created_at DESC`);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
