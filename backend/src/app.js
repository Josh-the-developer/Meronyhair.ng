import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/index.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { healthCheck } from "./config/db.js";

import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import wishlistRoutes from "./routes/wishlist.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import shippingRoutes from "./routes/shipping.routes.js";
import couponRoutes from "./routes/coupon.routes.js";
import loyaltyRoutes from "./routes/loyalty.routes.js";
import reviewRoutes from "./routes/review.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(config.isProd ? "combined" : "dev"));
  app.use(globalLimiter);

  app.get("/api/health", async (req, res) => {
    let dbOk = false;
    try {
      dbOk = await healthCheck();
    } catch {
      dbOk = false;
    }
    res.status(dbOk ? 200 : 503).json({
      success: true,
      status: dbOk ? "ok" : "degraded",
      service: "Merony Hair.NG API",
      version: "2.0.0",
      database: dbOk ? "connected" : "unreachable",
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/cart", cartRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/wishlist", wishlistRoutes);
  app.use("/api/contact", contactRoutes);
  app.use("/api/shipping", shippingRoutes);
  app.use("/api/coupons", couponRoutes);
  app.use("/api/loyalty", loyaltyRoutes);
  app.use("/api/reviews", reviewRoutes);

  // Static frontend (preserves Merony design)
  const frontendPath = path.join(__dirname, "../../frontend");
  app.use(express.static(frontendPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendPath, "index.html"), (err) => {
      if (err) next();
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
