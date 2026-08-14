import { query } from "../config/db.js";

export async function findAllProducts({ status = "active", limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT p.*, c.name AS category_name,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary LIMIT 1) AS primary_image
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ($1::text IS NULL OR p.status = $1)
     ORDER BY p.is_featured DESC, p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );
  return rows;
}

export async function findProductBySlug(slug) {
  const { rows } = await query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

export async function findProductById(id) {
  const { rows } = await query(`SELECT * FROM products WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function findVariantsByProductId(productId) {
  const { rows } = await query(
    `SELECT id, sku, name, length_inches, color, density, lace_type, cap_size,
            price, compare_at_price, stock_quantity, reserved_quantity,
            (stock_quantity - reserved_quantity) AS available,
            low_stock_threshold, is_active
     FROM product_variants
     WHERE product_id = $1 AND is_active = true
     ORDER BY length_inches NULLS LAST, price`,
    [productId]
  );
  return rows;
}

export async function findImagesByProductId(productId) {
  const { rows } = await query(
    `SELECT id, url, alt_text, sort_order, is_primary, variant_id
     FROM product_images
     WHERE product_id = $1
     ORDER BY is_primary DESC, sort_order`,
    [productId]
  );
  return rows;
}

export async function createProduct(data) {
  const { rows } = await query(
    `INSERT INTO products (
       name, slug, sku_base, short_description, description, category_id,
       base_price, compare_at_price, status, is_featured,
       texture, density, lace_type, hair_type, origin, grade, tags
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      data.name, data.slug, data.sku_base, data.short_description, data.description,
      data.category_id, data.base_price, data.compare_at_price, data.status || "draft",
      data.is_featured || false, data.texture, data.density, data.lace_type,
      data.hair_type || "100% Human Hair", data.origin, data.grade, data.tags || [],
    ]
  );
  return rows[0];
}
