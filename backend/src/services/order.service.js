import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { generateOrderNumber } from "../utils/orderNumber.js";
import * as cartService from "./cart.service.js";
import * as couponService from "./coupon.service.js";

/**
 * Create order from cart or explicit items.
 * SERVER calculates every price. Client total is ignored.
 */
export async function createOrder({
  userId,
  email,
  phone,
  items, // optional explicit [{ variantId, quantity }]
  shippingAddress,
  shippingMethodCode = "nationwide",
  couponCode,
  notes,
  sessionId,
}) {
  if (!email) throw new AppError("Email is required", 400);
  if (!shippingAddress?.street || !shippingAddress?.city || !shippingAddress?.state) {
    throw new AppError("Complete shipping address is required", 400);
  }

  // Resolve items: prefer explicit list, otherwise pull from cart
  let lineInputs = items;
  let cartId = null;
  if (!lineInputs || !lineInputs.length) {
    const cart = await cartService.getCart({ userId, sessionId });
    if (!cart.items.length) throw new AppError("Cart is empty", 400);
    lineInputs = cart.items.map((i) => ({
      variantId: i.variant_id,
      quantity: i.quantity,
    }));
    cartId = cart.cartId;
  }

  // Load shipping method
  const shipRes = await query(
    `SELECT * FROM shipping_methods WHERE code = $1 AND is_active = true`,
    [shippingMethodCode]
  );
  const shipping = shipRes.rows[0];
  if (!shipping) throw new AppError("Invalid shipping method", 400);

  return withTransaction(async (client) => {
    // Lock variants and validate stock
    const lines = [];
    let subtotal = 0;

    for (const input of lineInputs) {
      const { rows } = await client.query(
        `SELECT pv.id, pv.sku, pv.name AS variant_name, pv.price, pv.stock_quantity,
                pv.reserved_quantity, pv.is_active, p.id AS product_id, p.name AS product_name
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = $1
         FOR UPDATE OF pv`,
        [input.variantId]
      );
      const v = rows[0];
      if (!v || !v.is_active) {
        throw new AppError(`Variant ${input.variantId} not available`, 400);
      }
      const available = v.stock_quantity - v.reserved_quantity;
      if (available < input.quantity) {
        throw new AppError(
          `Insufficient stock for ${v.product_name} (${v.variant_name}). Available: ${available}`,
          400,
          "INSUFFICIENT_STOCK"
        );
      }

      const unitPrice = Number(v.price);
      const lineTotal = unitPrice * input.quantity;
      subtotal += lineTotal;

      lines.push({
        variant_id: v.id,
        product_id: v.product_id,
        product_name: v.product_name,
        variant_name: v.variant_name,
        sku: v.sku,
        unit_price: unitPrice,
        quantity: input.quantity,
        line_total: lineTotal,
      });

      // Reserve stock
      await client.query(
        `UPDATE product_variants
         SET reserved_quantity = reserved_quantity + $1, updated_at = NOW()
         WHERE id = $2`,
        [input.quantity, v.id]
      );

      await client.query(
        `INSERT INTO inventory_transactions
           (variant_id, type, quantity, reference_type, note)
         VALUES ($1, 'reservation', $2, 'order', 'Reserved for pending order')`,
        [v.id, input.quantity]
      );
    }

    // Coupon
    let discountAmount = 0;
    let couponId = null;
    if (couponCode) {
      const couponResult = await couponService.validateAndApply(client, {
        code: couponCode,
        userId,
        subtotal,
      });
      discountAmount = couponResult.discount;
      couponId = couponResult.couponId;
    }

    const shippingAmount = Number(shipping.base_price);
    const taxAmount = 0; // Nigeria: VAT often embedded; keep configurable later
    const total = Math.max(0, subtotal - discountAmount + shippingAmount + taxAmount);

    const orderNumber = generateOrderNumber();

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (
         order_number, user_id, email, phone, status, payment_status,
         subtotal, discount_amount, shipping_amount, tax_amount, total,
         currency, coupon_id, shipping_method, shipping_address, notes
       ) VALUES (
         $1,$2,$3,$4,'PENDING_PAYMENT','pending',
         $5,$6,$7,$8,$9,'NGN',$10,$11,$12,$13
       ) RETURNING *`,
      [
        orderNumber,
        userId || null,
        email.toLowerCase(),
        phone || shippingAddress.phone || null,
        subtotal,
        discountAmount,
        shippingAmount,
        taxAmount,
        total,
        couponId,
        shipping.code,
        JSON.stringify(shippingAddress),
        notes || null,
      ]
    );
    const order = orderRows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items
           (order_id, variant_id, product_id, product_name, variant_name, sku,
            unit_price, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          order.id,
          line.variant_id,
          line.product_id,
          line.product_name,
          line.variant_name,
          line.sku,
          line.unit_price,
          line.quantity,
          line.line_total,
        ]
      );
    }

    if (couponId) {
      await client.query(
        `INSERT INTO coupon_usages (coupon_id, user_id, order_id, discount_amount)
         VALUES ($1, $2, $3, $4)`,
        [couponId, userId || null, order.id, discountAmount]
      );
      await client.query(
        `UPDATE coupons SET usage_count = usage_count + 1 WHERE id = $1`,
        [couponId]
      );
    }

    if (cartId) {
      await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
    }

    return order;
  });
}

/**
 * Mark order as PAID and convert reservation into sale (stock decrement).
 * Called after successful payment verification OR admin manual mark.
 */
export async function markOrderPaid(orderId, { paymentReference, channel } = {}) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = rows[0];
    if (!order) throw new AppError("Order not found", 404);
    if (order.payment_status === "paid") return order; // idempotent

    if (order.status === "CANCELLED") {
      throw new AppError("Cannot pay a cancelled order", 400);
    }

    // Convert reservations to sales
    const items = await client.query(
      `SELECT variant_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );

    for (const item of items.rows) {
      await client.query(
        `UPDATE product_variants
         SET stock_quantity = stock_quantity - $1,
             reserved_quantity = GREATEST(0, reserved_quantity - $1),
             updated_at = NOW()
         WHERE id = $2`,
        [item.quantity, item.variant_id]
      );
      await client.query(
        `INSERT INTO inventory_transactions
           (variant_id, type, quantity, reference_type, reference_id, note)
         VALUES ($1, 'sale', $2, 'order', $3, 'Sale confirmed')`,
        [item.variant_id, -item.quantity, String(orderId)]
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE orders
       SET payment_status = 'paid',
           status = 'PAID',
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [orderId]
    );

    // Record payment row (without provider for now)
    await client.query(
      `INSERT INTO payments (order_id, provider, provider_reference, amount, currency, status, channel, paid_at)
       VALUES ($1, 'manual', $2, $3, 'NGN', 'success', $4, NOW())`,
      [orderId, paymentReference || `MANUAL-${order.order_number}`, order.total, channel || "manual"]
    );

    // Simple loyalty earn: 1 point per ₦1000
    if (order.user_id) {
      const points = Math.floor(Number(order.total) / 1000);
      if (points > 0) {
        await client.query(
          `INSERT INTO loyalty_accounts (user_id, points_balance, lifetime_points)
           VALUES ($1, $2, $2)
           ON CONFLICT (user_id) DO UPDATE SET
             points_balance = loyalty_accounts.points_balance + $2,
             lifetime_points = loyalty_accounts.lifetime_points + $2,
             updated_at = NOW()`,
          [order.user_id, points]
        );
        const acc = await client.query(
          `SELECT id, points_balance FROM loyalty_accounts WHERE user_id = $1`,
          [order.user_id]
        );
        if (acc.rows[0]) {
          await client.query(
            `INSERT INTO loyalty_transactions
               (account_id, type, points, balance_after, reference_type, reference_id, note)
             VALUES ($1, 'earn', $2, $3, 'order', $4, 'Order points')`,
            [acc.rows[0].id, points, acc.rows[0].points_balance, String(orderId)]
          );
        }
      }
    }

    return updated[0];
  });
}

export async function updateOrderStatus(orderId, newStatus, actorId) {
  const allowed = [
    "PENDING_PAYMENT", "PAID", "PROCESSING", "PACKED", "SHIPPED",
    "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REFUNDED",
  ];
  if (!allowed.includes(newStatus)) {
    throw new AppError("Invalid status", 400);
  }

  const { rows } = await query(
    `UPDATE orders SET status = $1, updated_at = NOW(),
       shipped_at = CASE WHEN $1 = 'SHIPPED' THEN NOW() ELSE shipped_at END,
       delivered_at = CASE WHEN $1 = 'DELIVERED' THEN NOW() ELSE delivered_at END,
       cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN NOW() ELSE cancelled_at END
     WHERE id = $2
     RETURNING *`,
    [newStatus, orderId]
  );
  if (!rows[0]) throw new AppError("Order not found", 404);

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, 'order_status_change', 'order', $2, $3)`,
    [actorId || null, String(orderId), JSON.stringify({ status: newStatus })]
  );

  return rows[0];
}

export async function getOrderById(id) {
  const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  const items = await query(`SELECT * FROM order_items WHERE order_id = $1`, [id]);
  return { ...rows[0], items: items.rows };
}

export async function getOrderByNumber(orderNumber) {
  const { rows } = await query(`SELECT * FROM orders WHERE order_number = $1`, [orderNumber]);
  if (!rows[0]) return null;
  const items = await query(`SELECT * FROM order_items WHERE order_id = $1`, [rows[0].id]);
  return { ...rows[0], items: items.rows };
}

export async function listOrders({ status, limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}
