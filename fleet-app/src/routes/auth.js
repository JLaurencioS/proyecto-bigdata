import { Router } from "express";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errors.js";

const router = Router();

const COOKIE_NAME = "fleet.sid";
const BCRYPT_ROUNDS = 12;

// Hash de relleno: si el usuario no existe, igual se ejecuta bcrypt.compare
// para que el tiempo de respuesta no revele qué usuarios existen.
const DUMMY_HASH = bcrypt.hashSync("relleno-para-igualar-tiempos", BCRYPT_ROUNDS);

const toPublicUser = (doc) => ({
  id: doc._id.toString(),
  username: doc.username,
  name: doc.name,
  role: doc.role,
});

const clearSessionCookie = (res) =>
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
  });

const regenerate = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const save = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
const destroy = (req) =>
  new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const username = req.body.username.trim().toLowerCase();
    const { password } = req.body;

    const user = await getDb().collection("users").findOne({ username });

    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.active || !passwordOk) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Usuario o contraseña incorrectos");
    }

    // Nueva sesión en cada login: evita fijación de sesión
    await regenerate(req);
    const publicUser = toPublicUser(user);
    req.session.user = publicUser;
    await save(req);

    res.json(publicUser);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res, next) => {
  try {
    await destroy(req);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get("/me", async (req, res, next) => {
  try {
    const user = await getDb()
      .collection("users")
      .findOne({ _id: new ObjectId(req.session.user.id) });

    // Si el usuario fue borrado o desactivado, se invalida la sesión
    if (!user || !user.active) {
      await destroy(req);
      clearSessionCookie(res);
      throw new ApiError(401, "UNAUTHORIZED", "Inicia sesión para continuar");
    }

    res.json(toPublicUser(user));
  } catch (err) {
    next(err);
  }
});

export default router;