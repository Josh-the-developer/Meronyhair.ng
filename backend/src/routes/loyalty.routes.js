import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { query } from "../config/db.js";

const router = Router();
router.use(authenticate);

router.get("/me", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT points_balance, lifetime_points, updated_at
       FROM loyalty_accounts WHERE user_id = $1`,
      [req.user.id]
    );
    const account = rows[0] || { points_balance: 0, lifetime_points: 0 };
    const tx = await query(
      `SELECT lt.type, lt.points, lt.balance_after, lt.note, lt.created_at
       FROM loyalty_transactions lt
       JOIN loyalty_accounts la ON la.id = lt.account_id
       WHERE la.user_id = $1
       ORDER BY lt.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({
      success: true,
      data: { ...account, transactions: tx.rows },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
