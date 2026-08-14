import { Router } from "express";
import * as productRepo from "../repositories/product.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { optionalAuth, requireManager } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/products
 * Public catalog (active products only by default)
 */
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status || "active";
    const products = await productRepo.findAllProducts({ status, limit, offset });
    res.json({ success: true, data: products, count: products.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:slugOrId
 */
router.get("/:slugOrId", async (req, res, next) => {
  try {
    const key = req.params.slugOrId;
    let product = null;
    if (/^\d+$/.test(key)) {
      product = await productRepo.findProductById(Number(key));
    } else {
      product = await productRepo.findProductBySlug(key);
    }
    if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");

    const [variants, images] = await Promise.all([
      productRepo.findVariantsByProductId(product.id),
      productRepo.findImagesByProductId(product.id),
    ]);

    res.json({
      success: true,
      data: { ...product, variants, images },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
