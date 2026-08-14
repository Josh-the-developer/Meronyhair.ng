import { Router } from "express";
import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { optionalAuth } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/coupons/validate
 * Preview discount without applying (for checkout UI)
 */
router.post("/validate", optionalAuth, async (req, res, next) => {
  try {
    const code = String(req.body.code || "").trim();
    const subtotal = Number(req.body.subtotal || 0);
    if (!code) throw new AppError("Coupon code required", 400);

    const { rows } = await query(
      `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = true`,
      [code]
    );
    const coupon = rows[0];
    if (!coupon) throw new AppError("Invalid coupon", 400, "INVALID_COUPON");
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      throw new AppError("Coupon expired", 400, "INVALID_COUPON");
    }
    if (subtotal < Number(coupon.min_order_amount || 0)) {
      throw new AppError(
        `Minimum order ₦${Number(coupon.min_order_amount).toLocaleString()}`,
        400,
        "INVALID_COUPON"
      );
    }

    let discount = 0;
    if (coupon.type === "percentage") {
      discount = (subtotal * Number(coupon.value)) / 100;
      if (coupon.max_discount != null) discount = Math.min(discount, Number(coupon.max_discount));
    } else {
      discount = Number(coupon.value);
    }
    discount = Math.min(discount, subtotal);
    discount = Math.round(discount * 100) / 100;

    res.json({
      success: true,
      data: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
