import { Router } from "express";
import bcrypt from "bcryptjs";
import { validate, registerSchema, loginSchema, adminLoginSchema } from "../validators/auth.validator.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { AppError } from "../middleware/errorHandler.js";
import { query } from "../config/db.js";
import { signToken } from "../middleware/auth.js";
import { config } from "../config/index.js";

const router = Router();

/**
 * POST /api/auth/register
 */
router.post("/register", authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.validated;

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) {
      throw new AppError("An account with this email already exists", 409, "EMAIL_EXISTS");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const roleRes = await query("SELECT id FROM roles WHERE name = 'customer'");
    const roleId = roleRes.rows[0]?.id;
    if (!roleId) throw new AppError("System roles not seeded", 500);

    const parts = name.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ") || null;

    const { rows } = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, created_at`,
      [email, passwordHash, firstName, lastName, phone || null, roleId]
    );

    const user = rows[0];

    // Create loyalty account
    await query(
      `INSERT INTO loyalty_accounts (user_id, points_balance, lifetime_points)
       VALUES ($1, 50, 50)`,
      [user.id]
    );

    const token = signToken({ sub: user.id, email: user.email, role: "customer" });

    res.status(201).json({
      success: true,
      message: "Account created",
      token,
      customer: {
        id: user.id,
        name: [user.first_name, user.last_name].filter(Boolean).join(" "),
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 */
router.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;

    const { rows } = await query(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.is_active, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [email]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    const token = signToken({ sub: user.id, email: user.email, role: user.role });

    res.json({
      success: true,
      message: "Login success",
      token,
      customer: {
        id: user.id,
        name: [user.first_name, user.last_name].filter(Boolean).join(" "),
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/admin/login
 * Uses either a seeded admin user in the DB or the ADMIN_PASSWORD_HASH env bootstrap.
 */
router.post("/admin/login", authLimiter, validate(adminLoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;

    // Prefer database admin users
    const { rows } = await query(
      `SELECT u.id, u.email, u.password_hash, u.is_active, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = $1 AND r.name IN ('admin', 'manager')`,
      [email]
    );

    let admin = rows[0];
    let valid = false;

    if (admin && admin.is_active) {
      valid = await bcrypt.compare(password, admin.password_hash);
    } else if (
      config.admin.email &&
      config.admin.passwordHash &&
      email === config.admin.email.toLowerCase()
    ) {
      // Bootstrap admin from environment (first-run)
      valid = await bcrypt.compare(password, config.admin.passwordHash);
      if (valid) {
        admin = { id: 0, email: config.admin.email, role: "admin" };
      }
    }

    if (!valid || !admin) {
      throw new AppError("Invalid admin credentials", 401, "INVALID_CREDENTIALS");
    }

    const token = signToken(
      { sub: admin.id || "admin-bootstrap", email: admin.email, role: admin.role || "admin" },
      config.adminJwtExpiresIn
    );

    res.json({
      success: true,
      message: "Admin login success",
      token,
      admin: { email: admin.email, role: admin.role || "admin" },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
