import http from "http";
import app from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";
import { initSockets } from "./sockets";
import { logger } from "./utils/logger";

async function main() {
  try {
    await connectDB();
  } catch (err) {
    logger.warn({ err }, "Database connection failed at startup - API will run degraded");
  }
  const server = http.createServer(app);
  initSockets(server);
  server.listen(env.port, () => {
    logger.info(`Adom Pharmacy API running on port ${env.port} [${env.nodeEnv}]`);
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
