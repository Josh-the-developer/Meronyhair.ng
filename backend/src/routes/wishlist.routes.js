import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();
router.use(authenticate);

async function getOrCreateWishlist(userId) {
  const existing = await query(`SELECT id FROM wishlists WHERE user_id = $1`, [userId]);
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await query(
    `INSERT INTO wishlists (user_id) VALUES ($1) RETURNING id`,
    [userId]
  );
  return rows[0].id;
}

router.get("/", async (req, res, next) => {
  try {
    const wid = await getOrCreateWishlist(req.user.id);
    const { rows } = await query(
      `SELECT wi.id, wi.product_id, wi.variant_id, wi.created_at,
              p.name, p.slug, p.base_price, p.status,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary LIMIT 1) AS image
       FROM wishlist_items wi
       JOIN products p ON p.id = wi.product_id
       WHERE wi.wishlist_id = $1
       ORDER BY wi.created_at DESC`,
      [wid]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/items", async (req, res, next) => {
  try {
    const productId = Number(req.body.productId);
    const variantId = req.body.variantId ? Number(req.body.variantId) : null;
    if (!productId) throw new AppError("productId required", 400);

    const wid = await getOrCreateWishlist(req.user.id);
    await query(
      `INSERT INTO wishlist_items (wishlist_id, product_id, variant_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [wid, productId, variantId]
    );
    res.status(201).json({ success: true, message: "Added to wishlist" });
  } catch (err) {
    next(err);
  }
});

router.delete("/items/:productId", async (req, res, next) => {
  try {
    const wid = await getOrCreateWishlist(req.user.id);
    await query(
      `DELETE FROM wishlist_items WHERE wishlist_id = $1 AND product_id = $2`,
      [wid, Number(req.params.productId)]
    );
    res.json({ success: true, message: "Removed from wishlist" });
  } catch (err) {
    next(err);
  }
});

export default router;
