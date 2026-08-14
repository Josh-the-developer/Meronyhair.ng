import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later.", code: "RATE_LIMIT" },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again later.", code: "AUTH_RATE_LIMIT" },
});

export const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  message: { success: false, message: "Too many payment attempts.", code: "PAYMENT_RATE_LIMIT" },
});
