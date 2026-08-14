import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { pool } from "./config/db.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Merony Hair.NG API v2 listening on http://localhost:${config.port}`);
  console.log(`Environment: ${config.env}`);
});

async function shutdown(signal) {
  console.log(`${signal} received – shutting down gracefully`);
  server.close(async () => {
    await pool.end();
    console.log("Database pool closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { app, server };
