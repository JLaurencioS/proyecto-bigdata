import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";
import { requireRole } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";

const router = Router();

const toDto = (d) => ({
  id: d._id.toString(),
  origin_zone: d.origin_zone,
  dest_zone: d.dest_zone,
  departure_time: d.departure_time.toISOString(),
  vehicle_id: d.vehicle_id,
  status: d.status,
  predicted_duration_min: d.predicted_duration_min ?? null,
  recommended_departure: d.recommended_departure
    ? d.recommended_departure.toISOString()
    : null,
  created_by: d.created_by_username,
  created_at: d.created_at.toISOString(),
});

// GET /api/despachos  (ambos roles; el despachador solo ve los suyos)
router.get("/despachos", requireRole("despachador", "analista"), async (req, res, next) => {
  try {
    const { role, id } = req.session.user;
    const limit = Number(req.query.limit) || 20;
    const filter = role === "despachador" ? { created_by: new ObjectId(id) } : {};

    const docs = await getDb()
      .collection("despachos")
      .find(filter)
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();

    res.json(docs.map(toDto));
  } catch (err) {
    next(err);
  }
});

// POST /api/despachos  (solo despachador)
router.post("/despachos", requireRole("despachador"), async (req, res, next) => {
  try {
    const { origin_zone, dest_zone, departure_time, vehicle_id } = req.body;

    if (origin_zone === dest_zone) {
      throw new ApiError(400, "VALIDATION_ERROR", "El origen y el destino deben ser distintos");
    }

    const departure = new Date(departure_time);
    const doc = {
      origin_zone,
      dest_zone,
      departure_time: departure,
      vehicle_id,
      status: "programado",
      predicted_duration_min: null, // lo llenará el ml-service
      recommended_departure: null,
      created_by: new ObjectId(req.session.user.id),
      created_by_username: req.session.user.username,
      created_at: new Date(),
    };

    const { insertedId } = await getDb().collection("despachos").insertOne(doc);
    res.status(201).json(toDto({ ...doc, _id: insertedId }));
  } catch (err) {
    next(err);
  }
});

export default router;