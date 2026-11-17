import { MongoClient } from "mongodb";
import { env } from "./env.js";

let client = null;
let db = null;

export async function connectDb() {
  if (db) return db;

  client = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(env.mongoDb);
  await db.command({ ping: 1 });
  await ensureIndexes(db);

  console.log(`MongoDB conectado (base "${env.mongoDb}")`);
  return db;
}

async function ensureIndexes(database) {
  // Un usuario por username (lo usaremos en el login)
  await database.collection("users").createIndex({ username: 1 }, { unique: true });
  // Zonas de NYC (GeoJSON): id de TLC único + índice geoespacial
  const zonas = database.collection("zonas");
  await zonas.createIndex({ zone_id: 1 }, { unique: true });
  await zonas.createIndex({ geometry: "2dsphere" });
  
  await database.collection("despachos").createIndex({ created_by: 1, created_at: -1 });
  await database.collection("metricas_zona_hora").createIndex({ zone_id: 1, hour: 1 });
}

export function getClient() {
  if (!client) throw new Error("MongoDB no está conectado");
  return client;
}

export function getDb() {
  if (!db) throw new Error("MongoDB no está conectado");
  return db;
}

export async function pingDb() {
  try {
    await getDb().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}