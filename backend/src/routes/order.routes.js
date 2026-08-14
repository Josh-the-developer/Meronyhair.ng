import { Router } from "express";
import { optionalAuth, authenticate, requireManager } from "../middleware/auth.js";
import * as orderService from "../services/order.service.js";
import { z } from "zod";

const router = Router();

const createSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(7).max(20).optional(),
  items: z
    .array(
      z.object({
        variantId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1).max(20),
      })
    )
    .optional(),
  shippingAddress: z.object({
    full_name: z.string().min(2),
    phone: z.string().min(7),
    street: z.string().min(3),
    landmark: z.string().optional(),
    city: z.string().min(2),
    state: z.string().min(2),
    country: z.string().default("NG"),
    postal_code: z.string().optional(),
  }),
  shippingMethod: z.string().default("nationwide"),
  couponCode: z.string().optional(),
  notes: z.string().max(500).optional(),
  sessionId: z.string().optional(),
});

/**
 * POST /api/orders
 * Creates order in PENDING_PAYMENT. Does not charge payment here.
 */
router.post("/", optionalAuth, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const order = await orderService.createOrder({
      userId: req.user?.id,
      email: body.email,
      phone: body.phone,
      items: body.items,
      shippingAddress: body.shippingAddress,
      shippingMethodCode: body.shippingMethod,
      couponCode: body.couponCode,
      notes: body.notes,
      sessionId: body.sessionId || req.headers["x-session-id"],
    });
    res.status(201).json({
      success: true,
      message: "Order created. Awaiting payment.",
      data: order,
    });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        errors: err.errors,
      });
    }
    next(err);
  }
});

router.get("/:idOrNumber", optionalAuth, async (req, res, next) => {
  try {
    const key = req.params.idOrNumber;
    let order;
    if (/^\d+$/.test(key)) {
      order = await orderService.getOrderById(Number(key));
    } else {
      order = await orderService.getOrderByNumber(key);
    }
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    // Customers can only see their own orders
    if (req.user?.role === "customer" && order.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

/** Admin/manager: list orders */
router.get("/", authenticate, requireManager, async (req, res, next) => {
  try {
    const orders = await orderService.listOrders({
      status: req.query.status,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
    res.json({ success: true, data: orders, count: orders.length });
  } catch (err) {
    next(err);
  }
});

/** Admin: update status */
router.patch("/:id/status", authenticate, requireManager, async (req, res, next) => {
  try {
    const order = await orderService.updateOrderStatus(
      Number(req.params.id),
      req.body.status,
      req.user?.id
    );
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin: manually mark as paid (until Paystack is wired).
 * This still runs the real inventory conversion logic.
 */
router.post("/:id/mark-paid", authenticate, requireManager, async (req, res, next) => {
  try {
    const order = await orderService.markOrderPaid(Number(req.params.id), {
      paymentReference: req.body.reference,
      channel: req.body.channel || "manual",
    });
    res.json({ success: true, message: "Order marked as paid", data: order });
  } catch (err) {
    next(err);
  }
});

export default router;
