import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { AppError } from "./errorHandler.js";
import { query } from "../config/db.js";

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token;
  return null;
}

export function signToken(payload, expiresIn = config.jwtExpiresIn) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

export async function authenticate(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) throw new AppError("Authentication required", 401, "UNAUTHORIZED");

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    // Optional: re-check user is still active
    if (decoded.sub) {
      const { rows } = await query(
        `SELECT u.id, u.email, u.is_active, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1`,
        [decoded.sub]
      );
      if (!rows[0] || !rows[0].is_active) {
        throw new AppError("Account inactive or not found", 401, "ACCOUNT_INACTIVE");
      }
      req.user = {
        id: rows[0].id,
        email: rows[0].email,
        role: rows[0].role,
      };
    } else {
      req.user = decoded;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth – attaches user if token present, otherwise continues */
export async function optionalAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return next();
  return authenticate(req, res, next);
}

/**
 * Role-based access control
 * usage: requireRoles('admin', 'manager')
 */
export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401, "UNAUTHORIZED"));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError("Insufficient permissions", 403, "FORBIDDEN"));
    }
    next();
  };
}

export const requireAdmin = requireRoles("admin");
export const requireManager = requireRoles("admin", "manager");
export const requireInventory = requireRoles("admin", "manager", "inventory_manager");
export const requireSupport = requireRoles("admin", "manager", "support");
