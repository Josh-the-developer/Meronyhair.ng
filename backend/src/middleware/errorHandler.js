import { config } from "../config/index.js";

export class AppError extends Error {
  constructor(message, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
}

export function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";
  const message =
    status === 500 && config.isProd
      ? "An unexpected error occurred"
      : err.message || "Internal Server Error";

  if (status >= 500) {
    console.error("[error]", {
      method: req.method,
      path: req.originalUrl,
      message: err.message,
      stack: config.isProd ? undefined : err.stack,
    });
  }

  res.status(status).json({
    success: false,
    message,
    code,
    ...(config.isProd ? {} : { stack: err.stack }),
  });
}
