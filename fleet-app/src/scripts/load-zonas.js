// Carga las zonas de taxi de NYC (GeoJSON en WGS84) a la colección `zonas`.
// Uso:
//   npm run load:zonas                          -> data/zonas.sample.geojson (solo demo)
//   npm run load:zonas -- ruta/taxi_zones.geojson
//   npm run load:zonas -- https://.../taxi_zones.geojson
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "fleet";
const source = process.argv[2] || path.resolve(__dirname, "../../data/zonas.sample.geojson");

if (!uri) {
  console.error("Falta MONGO_URI en .env");
  process.exit(1);
}

async function readGeoJSON(src) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${src}`);
    return res.json();
  }
  return JSON.parse(await fs.readFile(src, "utf8"));
}

// Acepta los nombres de propiedad de las distintas publicaciones de TLC / NYC OpenData
const pick = (p, ...keys) => keys.map((k) => p?.[k]).find((v) => v !== undefined && v !== null);

function toDoc(feature) {
  const p = feature.properties || {};
  const zone_id = Number(pick(p, "zone_id", "location_id", "LocationID", "OBJECTID"));
  const type = feature.geometry?.type;
  if (!Number.isInteger(zone_id) || !["Polygon", "MultiPolygon"].includes(type)) return null;
  return {
    zone_id,
    zone: String(pick(p, "zone", "Zone") ?? `Zona ${zone_id}`),
    borough: String(pick(p, "borough", "Borough") ?? "Desconocido"),
    geometry: feature.geometry,
  };
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

try {
  const geo = await readGeoJSON(source);
  if (geo.type !== "FeatureCollection" || !Array.isArray(geo.features)) {
    throw new Error("El archivo no es un FeatureCollection GeoJSON");
  }

  // Si las coordenadas parecen proyectadas (no lat/lon), avisa: Leaflet/2dsphere esperan WGS84
  const first = geo.features[0]?.geometry?.coordinates?.flat(3)?.[0];
  if (typeof first === "number" && Math.abs(first) > 180) {
    throw new Error("Las coordenadas no están en WGS84 (EPSG:4326). Reproyecta el archivo antes de cargarlo.");
  }

  const docs = geo.features.map(toDoc).filter(Boolean);
  const skipped = geo.features.length - docs.length;
  if (docs.length === 0) throw new Error("No hay zonas válidas para cargar");

  await client.connect();
  const col = client.db(dbName).collection("zonas");
  await col.createIndex({ zone_id: 1 }, { unique: true });
  await col.createIndex({ geometry: "2dsphere" });

  await col.bulkWrite(
    docs.map((d) => ({
      updateOne: {
        filter: { zone_id: d.zone_id },
        update: { $set: { ...d, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        upsert: true,
      },
    }))
  );
  console.log(`Zonas cargadas: ${docs.length}${skipped ? ` (${skipped} omitidas por formato)` : ""} desde ${source}`);
} catch (err) {
  console.error("Error cargando zonas:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
