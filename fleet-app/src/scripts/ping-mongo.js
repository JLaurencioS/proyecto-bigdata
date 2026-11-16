import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "fleet";

if (!uri) {
  console.error("Falta MONGO_URI en .env");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

try {
  await client.connect();
  const res = await client.db(dbName).command({ ping: 1 });
  console.log(`Conexión correcta a "${dbName}":`, res);
} catch (err) {
  console.error("No se pudo conectar a MongoDB:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}