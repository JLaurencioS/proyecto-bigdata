import { Router } from "express";
import { getDb } from "../config/db.js";
import { ApiError } from "../middleware/errors.js";

const router = Router();

// Las zonas casi no cambian: se arman una vez y se reutilizan en memoria.
let cache = null;

export function clearZonasCache() {
  cache = null;
}

// GET /api/zonas  -> FeatureCollection GeoJSON (WGS84)
router.get("/zonas", async (req, res, next) => {
  try {
    if (!cache) {
      const docs = await getDb()
        .collection("zonas")
        .find({}, { projection: { _id: 0, zone_id: 1, zone: 1, borough: 1, geometry: 1 } })
        .sort({ zone_id: 1 })
        .toArray();

      if (docs.length === 0) {
        throw new ApiError(503, "ZONES_NOT_LOADED", "Las zonas aún no se han cargado (npm run load:zonas)");
      }

      cache = JSON.stringify({
        type: "FeatureCollection",
        features: docs.map((d) => ({
          type: "Feature",
          geometry: d.geometry,
          properties: { zone_id: d.zone_id, zone: d.zone, borough: d.borough },
        })),
      });
    }

    res.set("Cache-Control", "private, max-age=3600");
    res.type("application/geo+json").send(cache);
  } catch (err) {
    next(err);
  }
});

export default router;
