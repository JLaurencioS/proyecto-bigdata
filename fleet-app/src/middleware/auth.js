import { ApiError } from "./errors.js";

/**
 * Handler del esquema de seguridad `sessionCookie` del openapi.yml.
 * El validador lo ejecuta en cada operación que declare `security`.
 */
export function sessionCookieHandler(req) {
  if (!req.session?.user) {
    throw new ApiError(401, "UNAUTHORIZED", "Inicia sesión para continuar");
  }
  return true;
}

/** restringe por rol. */
export function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return next(new ApiError(401, "UNAUTHORIZED", "Inicia sesión para continuar"));
    if (!roles.includes(user.role)) {
      return next(new ApiError(403, "FORBIDDEN", "No tienes permisos para esta acción"));
    }
    next();
  };
}