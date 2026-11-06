import app from "./app";
import { logger } from "./lib/logger";
import { initializeAdminPassword } from "./lib/adminPassword";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  await initializeAdminPassword();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer().catch((error: unknown) => {
  logger.fatal({ err: error }, "Server initialization failed");
  process.exit(1);
});
