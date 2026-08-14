import { Router } from "express";
import { authenticate, optionalAuth, requireManager } from "../middleware/auth.js";
import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { z } from "zod";

const router = Router();

router.get("/product/:productId", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.rating, r.title, r.body, r.is_verified_purchase, r.created_at,
              u.first_name, u.last_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1 AND r.is_approved = true
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [Number(req.params.productId)]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      productId: z.coerce.number().int().positive(),
      orderId: z.coerce.number().int().positive().optional(),
      rating: z.coerce.number().int().min(1).max(5),
      title: z.string().max(200).optional(),
      body: z.string().min(5).max(2000),
    });
    const data = schema.parse(req.body);

    // Verified purchase if order belongs to user and contains product
    let verified = false;
    if (data.orderId) {
      const check = await query(
        `SELECT 1 FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.id = $1 AND o.user_id = $2 AND o.payment_status = 'paid'
           AND oi.product_id = $3`,
        [data.orderId, req.user.id, data.productId]
      );
      verified = check.rows.length > 0;
    }

    const { rows } = await query(
      `INSERT INTO reviews (product_id, user_id, order_id, rating, title, body, is_verified_purchase, is_approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false)
       RETURNING *`,
      [data.productId, req.user.id, data.orderId || null, data.rating, data.title || null, data.body, verified]
    );

    // Recalculate average (only approved reviews – this one is pending)
    res.status(201).json({
      success: true,
      message: "Review submitted for moderation",
      data: rows[0],
    });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ success: false, message: "Validation failed", errors: err.errors });
    }
    next(err);
  }
});

/** Admin approve/reject */
router.patch("/:id/moderate", authenticate, requireManager, async (req, res, next) => {
  try {
    const approved = Boolean(req.body.approved);
    const { rows } = await query(
      `UPDATE reviews SET is_approved = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [approved, Number(req.params.id)]
    );
    if (!rows[0]) throw new AppError("Review not found", 404);

    if (approved) {
      await query(
        `UPDATE products p SET
           rating_avg = sub.avg,
           rating_count = sub.cnt
         FROM (
           SELECT product_id, ROUND(AVG(rating)::numeric, 2) AS avg, COUNT(*)::int AS cnt
           FROM reviews WHERE product_id = $1 AND is_approved = true
           GROUP BY product_id
         ) sub
         WHERE p.id = sub.product_id`,
        [rows[0].product_id]
      );
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
