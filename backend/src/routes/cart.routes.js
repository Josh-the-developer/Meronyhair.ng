import { Router } from "express";
import { optionalAuth, authenticate } from "../middleware/auth.js";
import * as cartService from "../services/cart.service.js";
import { z } from "zod";

const router = Router();

function sessionIdFrom(req) {
  return req.headers["x-session-id"] || req.body?.sessionId || null;
}

router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const cart = await cartService.getCart({
      userId: req.user?.id,
      sessionId: sessionIdFrom(req),
    });
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
});

router.post("/items", optionalAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      variantId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1).max(20).default(1),
      sessionId: z.string().optional(),
    });
    const body = schema.parse(req.body);
    const cart = await cartService.addToCart({
      userId: req.user?.id,
      sessionId: body.sessionId || sessionIdFrom(req),
      variantId: body.variantId,
      quantity: body.quantity,
    });
    res.status(201).json({ success: true, data: cart });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ success: false, message: "Invalid input", errors: err.errors });
    }
    next(err);
  }
});

router.patch("/items/:variantId", optionalAuth, async (req, res, next) => {
  try {
    const quantity = Number(req.body.quantity);
    const cart = await cartService.updateCartItem({
      userId: req.user?.id,
      sessionId: sessionIdFrom(req),
      variantId: Number(req.params.variantId),
      quantity,
    });
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
});

router.delete("/items/:variantId", optionalAuth, async (req, res, next) => {
  try {
    const cart = await cartService.removeFromCart({
      userId: req.user?.id,
      sessionId: sessionIdFrom(req),
      variantId: Number(req.params.variantId),
    });
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
});

router.post("/merge", authenticate, async (req, res, next) => {
  try {
    await cartService.mergeGuestCart(req.user.id, sessionIdFrom(req));
    const cart = await cartService.getCart({ userId: req.user.id });
    res.json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
});

export default router;
