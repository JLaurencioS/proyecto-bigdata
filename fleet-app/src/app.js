import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import OpenApiValidator from "express-openapi-validator";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "./config/env.js";
import { getClient } from "./config/db.js";
import { sessionCookieHandler } from "./middleware/auth.js";
import { notFound, errorHandler } from "./middleware/errors.js";
import healthRouter from "./routes/health.js";

import authRouter from "./routes/auth.js";
import zonasRouter from "./routes/zonas.js";

import cookieParser from "cookie-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(__dirname, "../openapi.yml");
const publicDir = path.resolve(__dirname, "../public");
const leafletDir = path.resolve(__dirname, "../node_modules/leaflet/dist");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (env.trustProxy) app.set("trust proxy", 1);

  // --- Seguridad de cabeceras ---
  // CSP preparada para Leaflet (paso 4): scripts propios y tiles de OpenStreetMap.
  app.use(
    helmet({
      // OSM exige el Referer; helmet lo quita por defecto ("no-referrer")
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "img-src": ["'self'", "data:", "https://*.tile.openstreetmap.org"],
          "connect-src": ["'self'"],
          // Evita forzar HTTPS en desarrollo local por HTTP
          "upgrade-insecure-requests": env.cookieSecure ? [] : null,
        },
      },
    })
  );

  // --- Frontend estático (no necesita sesión) ---
  app.use(express.static(publicDir));
  // Leaflet servido localmente: la CSP no permite scripts de CDNs
  app.use("/vendor/leaflet", express.static(leafletDir));

  // --- Body JSON (límite pequeño: nuestra API solo recibe objetos chicos) ---
  app.use(express.json({ limit: "100kb" }));

  app.use(cookieParser());

  // --- Sesión en MongoDB ---
  const ttlSeconds = env.sessionTtlHours * 3600;
  app.use(
    session({
      name: "fleet.sid",
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false, // no crea sesión (ni cookie) hasta que haya login
      store: MongoStore.create({
        client: getClient(),
        dbName: env.mongoDb,
        collectionName: "sessions",
        ttl: ttlSeconds,
      }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.cookieSecure,
        maxAge: ttlSeconds * 1000,
      },
    })
  );

  // --- Límite de intentos de login (antes del validador para contar también los 400) ---
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) =>
      res.status(429).json({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Demasiados intentos; espera antes de reintentar",
        },
      }),
  });
  app.use("/api/auth/login", loginLimiter);

  // --- Contrato: valida requests, seguridad y (en dev) responses ---
  app.use(
    OpenApiValidator.middleware({
      apiSpec: specPath,
      validateRequests: true,
      validateResponses: env.validateResponses
      ? {
            onError: (err, body, req) => {
              // Solo registra, no rompe la respuesta
              console.warn(`[contrato] ${req.method} ${req.originalUrl}: ${err.message}`);
            },
          }
        : false,
      validateSecurity: {
        handlers: { sessionCookie: sessionCookieHandler },
      },
    })
  );

  // --- Rutas ---
  app.use("/api", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", zonasRouter);

  // --- Errores ---
  app.use(notFound);
  app.use(errorHandler);

  return app;
}