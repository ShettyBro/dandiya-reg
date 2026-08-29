import { loadEnv } from "./config/env.js";
import { createApp } from "./create-app.js";
import { getPrismaClient } from "../db/client.js";

const env = loadEnv();
const prisma = getPrismaClient();
const app = createApp(env, prisma);

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`dandiya-server listening on 0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  console.log(`received ${signal}, shutting down`);
  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
