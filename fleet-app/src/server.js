import { env } from "./config/env.js";
import { connectDb, closeDb } from "./config/db.js";
import { createApp } from "./app.js";

try {
  await connectDb();
} catch (err) {
  console.error("No se pudo conectar a MongoDB:", err.message);
  process.exit(1);
}

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`Servidor en http://localhost:${env.port} (${env.nodeEnv})`);
});

async function shutdown(signal) {
  console.log(`\n${signal} recibido, cerrando...`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));