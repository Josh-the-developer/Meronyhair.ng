import { AppError } from "../middleware/errorHandler.js";

/**
 * Validate coupon and compute discount.
 * Accepts a transaction client so it can run inside order creation.
 */
export async function validateAndApply(client, { code, userId, subtotal }) {
  const { rows } = await client.query(
    `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) FOR UPDATE`,
    [code]
  );
  const coupon = rows[0];
  if (!coupon || !coupon.is_active) {
    throw new AppError("Invalid or inactive coupon", 400, "INVALID_COUPON");
  }
  if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
    throw new AppError("Coupon is not active yet", 400, "INVALID_COUPON");
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    throw new AppError("Coupon has expired", 400, "INVALID_COUPON");
  }
  if (coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit) {
    throw new AppError("Coupon usage limit reached", 400, "INVALID_COUPON");
  }
  if (Number(subtotal) < Number(coupon.min_order_amount || 0)) {
    throw new AppError(
      `Minimum order amount for this coupon is ₦${Number(coupon.min_order_amount).toLocaleString()}`,
      400,
      "INVALID_COUPON"
    );
  }

  if (userId && coupon.per_customer_limit) {
    const used = await client.query(
      `SELECT COUNT(*)::int AS c FROM coupon_usages WHERE coupon_id = $1 AND user_id = $2`,
      [coupon.id, userId]
    );
    if (used.rows[0].c >= coupon.per_customer_limit) {
      throw new AppError("You have already used this coupon", 400, "INVALID_COUPON");
    }
  }

  let discount = 0;
  if (coupon.type === "percentage") {
    discount = (Number(subtotal) * Number(coupon.value)) / 100;
    if (coupon.max_discount != null) {
      discount = Math.min(discount, Number(coupon.max_discount));
    }
  } else {
    discount = Number(coupon.value);
  }
  discount = Math.min(discount, Number(subtotal));
  discount = Math.round(discount * 100) / 100;

  return { couponId: coupon.id, discount, code: coupon.code };
}

export async function listCoupons() {
  const { query } = await import("../config/db.js");
  const { rows } = await query(`SELECT * FROM coupons ORDER BY created_at DESC`);
  return rows;
}
