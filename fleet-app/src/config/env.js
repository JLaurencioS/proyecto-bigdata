import "dotenv/config";

const required = ["MONGO_URI", "SESSION_SECRET"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Faltan variables en .env: ${missing.join(", ")}`);
  process.exit(1);
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProd = nodeEnv === "production";

if (process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET debe tener al menos 32 caracteres.");
  process.exit(1);
}

export const env = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI,
  mongoDb: process.env.MONGO_DB || "fleet",
  sessionSecret: process.env.SESSION_SECRET,
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS) || 8,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  trustProxy: process.env.TRUST_PROXY === "true",
  validateResponses: process.env.VALIDATE_RESPONSES
    ? process.env.VALIDATE_RESPONSES === "true"
    : !isProd,
};