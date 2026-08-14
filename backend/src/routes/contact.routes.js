import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { sendContactAcknowledgement } from "../services/email.service.js";

const router = Router();

const schema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.string().max(200).optional(),
  message: z.string().min(5).max(5000),
});

router.post("/", authLimiter, async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO contact_messages (name, email, phone, subject, message)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [data.name, data.email.toLowerCase(), data.phone || null, data.subject || "Storefront enquiry", data.message]
    );
    await sendContactAcknowledgement({ name: data.name, email: data.email });
    res.status(201).json({
      success: true,
      message: "Message received. We will reply soon.",
      data: rows[0],
    });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ success: false, message: "Validation failed", errors: err.errors });
    }
    next(err);
  }
});

export default router;
