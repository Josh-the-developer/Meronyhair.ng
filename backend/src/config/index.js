import "dotenv/config";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    console.warn(`[config] Missing ${name} – using insecure development fallback`);
  }
  return value;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  env: process.env.NODE_ENV || "development",
  isProd,
  port: Number(process.env.PORT || 3000),
  jwtSecret: required(
    "JWT_SECRET",
    isProd ? undefined : "dev-only-insecure-secret-change-me-32chars"
  ),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "8h",
  databaseUrl: required(
    "DATABASE_URL",
    isProd ? undefined : "postgresql://merony:merony@localhost:5432/merony_hair_ng"
  ),
  corsOrigin: process.env.CORS_ORIGIN || (isProd ? false : true),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || "",
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || "console",
    apiKey: process.env.EMAIL_API_KEY || "",
    from: process.env.EMAIL_FROM || "Merony Hair.NG <noreply@meronyhair.ng>",
    support: process.env.EMAIL_SUPPORT || "hellomeronyhair@gmail.com",
  },
  admin: {
    email: process.env.ADMIN_EMAIL || "admin@meronyhair.ng",
    passwordHash: process.env.ADMIN_PASSWORD_HASH || "",
  },
  logLevel: process.env.LOG_LEVEL || "info",
};

if (isProd && config.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}
