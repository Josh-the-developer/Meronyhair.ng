import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";

async function getOrCreateCart({ userId, sessionId }) {
  if (userId) {
    const existing = await query(`SELECT id FROM carts WHERE user_id = $1`, [userId]);
    if (existing.rows[0]) return existing.rows[0].id;
    const { rows } = await query(
      `INSERT INTO carts (user_id) VALUES ($1) RETURNING id`,
      [userId]
    );
    return rows[0].id;
  }
  if (!sessionId) throw new AppError("sessionId required for guest cart", 400);
  const existing = await query(`SELECT id FROM carts WHERE session_id = $1`, [sessionId]);
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await query(
    `INSERT INTO carts (session_id) VALUES ($1) RETURNING id`,
    [sessionId]
  );
  return rows[0].id;
}

export async function getCart({ userId, sessionId }) {
  const cartId = await getOrCreateCart({ userId, sessionId });
  const { rows } = await query(
    `SELECT ci.id, ci.quantity, ci.variant_id,
            pv.sku, pv.name AS variant_name, pv.price, pv.compare_at_price,
            pv.stock_quantity, pv.reserved_quantity,
            (pv.stock_quantity - pv.reserved_quantity) AS available,
            p.id AS product_id, p.name AS product_name, p.slug,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary LIMIT 1) AS image
     FROM cart_items ci
     JOIN product_variants pv ON pv.id = ci.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE ci.cart_id = $1
     ORDER BY ci.created_at`,
    [cartId]
  );

  const items = rows.map((r) => ({
    ...r,
    line_total: Number(r.price) * r.quantity,
  }));
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);

  return { cartId, items, subtotal, itemCount: items.reduce((s, i) => s + i.quantity, 0) };
}

export async function addToCart({ userId, sessionId, variantId, quantity = 1 }) {
  if (quantity < 1) throw new AppError("Quantity must be at least 1", 400);

  const variant = await query(
    `SELECT id, stock_quantity, reserved_quantity, is_active
     FROM product_variants WHERE id = $1`,
    [variantId]
  );
  if (!variant.rows[0] || !variant.rows[0].is_active) {
    throw new AppError("Product variant not available", 404);
  }
  const available =
    variant.rows[0].stock_quantity - variant.rows[0].reserved_quantity;
  if (available < quantity) {
    throw new AppError(`Only ${available} units available`, 400, "INSUFFICIENT_STOCK");
  }

  const cartId = await getOrCreateCart({ userId, sessionId });

  await query(
    `INSERT INTO cart_items (cart_id, variant_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (cart_id, variant_id)
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = NOW()`,
    [cartId, variantId, quantity]
  );

  // Cap at available stock
  await query(
    `UPDATE cart_items SET quantity = LEAST(quantity, $1)
     WHERE cart_id = $2 AND variant_id = $3`,
    [available, cartId, variantId]
  );

  return getCart({ userId, sessionId });
}

export async function updateCartItem({ userId, sessionId, variantId, quantity }) {
  if (quantity < 1) {
    return removeFromCart({ userId, sessionId, variantId });
  }
  const cartId = await getOrCreateCart({ userId, sessionId });

  const variant = await query(
    `SELECT stock_quantity - reserved_quantity AS available FROM product_variants WHERE id = $1`,
    [variantId]
  );
  const available = variant.rows[0]?.available ?? 0;
  if (available < quantity) {
    throw new AppError(`Only ${available} units available`, 400, "INSUFFICIENT_STOCK");
  }

  await query(
    `UPDATE cart_items SET quantity = $1, updated_at = NOW()
     WHERE cart_id = $2 AND variant_id = $3`,
    [quantity, cartId, variantId]
  );
  return getCart({ userId, sessionId });
}

export async function removeFromCart({ userId, sessionId, variantId }) {
  const cartId = await getOrCreateCart({ userId, sessionId });
  await query(`DELETE FROM cart_items WHERE cart_id = $1 AND variant_id = $2`, [
    cartId,
    variantId,
  ]);
  return getCart({ userId, sessionId });
}

export async function clearCart(cartId) {
  await query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
}

/** Merge guest cart into user cart on login */
export async function mergeGuestCart(userId, sessionId) {
  if (!sessionId) return;
  const guest = await query(`SELECT id FROM carts WHERE session_id = $1`, [sessionId]);
  if (!guest.rows[0]) return;

  const userCartId = await getOrCreateCart({ userId });
  const guestCartId = guest.rows[0].id;

  await withTransaction(async (client) => {
    const items = await client.query(
      `SELECT variant_id, quantity FROM cart_items WHERE cart_id = $1`,
      [guestCartId]
    );
    for (const item of items.rows) {
      await client.query(
        `INSERT INTO cart_items (cart_id, variant_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, variant_id)
         DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
        [userCartId, item.variant_id, item.quantity]
      );
    }
    await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [guestCartId]);
    await client.query(`DELETE FROM carts WHERE id = $1`, [guestCartId]);
  });
}
