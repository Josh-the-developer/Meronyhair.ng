import { Router } from "express";
import { query } from "../config/db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, code, description, base_price, estimated_days_min, estimated_days_max
       FROM shipping_methods WHERE is_active = true ORDER BY sort_order, base_price`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
