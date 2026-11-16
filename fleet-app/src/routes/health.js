import { Router } from "express";
import { pingDb } from "../config/db.js";

const router = Router();

router.get("/health", async (req, res) => {
  const mongoUp = await pingDb();
  res.status(mongoUp ? 200 : 503).json({
    status: mongoUp ? "ok" : "degraded",
    mongo: mongoUp ? "up" : "down",
    uptime_s: Math.round(process.uptime()),
  });
});

export default router;