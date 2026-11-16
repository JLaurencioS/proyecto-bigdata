import { env } from "../config/env.js";

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const CODES = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "TOO_MANY_REQUESTS",
};

const MESSAGES = {
  400: "Datos inválidos",
  401: "Inicia sesión para continuar",
  403: "No tienes permisos para esta acción",
  404: "Recurso no encontrado",
  405: "Método no permitido",
  415: "Tipo de contenido no soportado",
  429: "Demasiados intentos; espera antes de reintentar",
};

export function notFound(req, res, next) {
  next(new ApiError(404, "NOT_FOUND", MESSAGES[404]));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  if (err.type === "entity.parse.failed") status = 400; // JSON mal formado

  let code;
  let message;
  let details;

  if (err instanceof ApiError) {
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (status < 500) {
    // Errores del validador OpenAPI y de Express
    code = CODES[status] || "BAD_REQUEST";
    message = MESSAGES[status] || err.message;
    if (Array.isArray(err.errors)) {
      details = err.errors.map((e) => ({ path: e.path, message: e.message }));
    }
  } else {
    console.error(err);
    code = "INTERNAL_ERROR";
    message = env.isProd ? "Error interno del servidor" : err.message;
  }

  res.status(status).json({
    error: { code, message, ...(details ? { details } : {}) },
  });
}