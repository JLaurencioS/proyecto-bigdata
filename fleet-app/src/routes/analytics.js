import { Router } from "express";
import { getDb } from "../config/db.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();
const col = () => getDb().collection("metricas_zona_hora");

// GET /api/kpis  (solo analista)
router.get("/kpis", requireRole("analista"), async (req, res, next) => {
  try {
    const [totalsAgg, byHour, last] = await Promise.all([
      col()
        .aggregate([
          {
            $group: {
              _id: null,
              trips: { $sum: "$trips" },
              dur: { $sum: { $multiply: ["$avg_duration_min", "$trips"] } },
              spd: { $sum: { $multiply: ["$avg_speed_kmh", "$trips"] } },
              slow: { $sum: { $multiply: ["$slow_pct", "$trips"] } },
            },
          },
        ])
        .toArray(),
      col()
        .aggregate([
          {
            $group: {
              _id: "$hour",
              trips: { $sum: "$trips" },
              dur: { $sum: { $multiply: ["$avg_duration_min", "$trips"] } },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      col().find({}, { projection: { updated_at: 1 } }).sort({ updated_at: -1 }).limit(1).toArray(),
    ]);

    const t = totalsAgg[0];
    const r2 = (n) => Math.round(n * 100) / 100;

    res.json({
      updated_at: last[0]?.updated_at ? last[0].updated_at.toISOString() : null,
      totals: t
        ? {
            trips: t.trips,
            avg_duration_min: r2(t.dur / t.trips),
            avg_speed_kmh: r2(t.spd / t.trips),
            slow_pct: r2(t.slow / t.trips),
          }
        : { trips: 0, avg_duration_min: 0, avg_speed_kmh: 0, slow_pct: 0 },
      by_hour: byHour.map((h) => ({
        hour: h._id,
        trips: h.trips,
        avg_duration_min: r2(h.dur / h.trips),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zonas/metricas  (solo analista)
router.get("/zonas/metricas", requireRole("analista"), async (req, res, next) => {
  try {
    const rows = await col()
      .aggregate([
        {
          $group: {
            _id: "$zone_id",
            trips: { $sum: "$trips" },
            spd: { $sum: { $multiply: ["$avg_speed_kmh", "$trips"] } },
            slow: { $sum: { $multiply: ["$slow_pct", "$trips"] } },
            cluster: { $last: "$cluster" },
          },
        },
        { $match: { trips: { $gt: 0 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    const r2 = (n) => Math.round(n * 100) / 100;
    res.json(
      rows.map((z) => ({
        zone_id: z._id,
        trips: z.trips,
        avg_speed_kmh: r2(z.spd / z.trips),
        slow_pct: r2(z.slow / z.trips),
        cluster: z.cluster ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

export default router;