import "dotenv/config";
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";

const BCRYPT_ROUNDS = 12;

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "fleet";

const users = [
  {
    username: "despachador1",
    name: "Tadeo Despachador",
    role: "despachador",
    password: process.env.SEED_DISPATCHER_PASSWORD,
  },
  {
    username: "analista1",
    name: "Abuelito Analista",
    role: "analista",
    password: process.env.SEED_ANALYST_PASSWORD,
  },
];

if (!uri) {
  console.error("Falta MONGO_URI en .env");
  process.exit(1);
}
for (const u of users) {
  if (!u.password || u.password.length < 8) {
    console.error(`La contraseña semilla de ${u.username} falta o tiene menos de 8 caracteres (.env)`);
    process.exit(1);
  }
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

try {
  await client.connect();
  const col = client.db(dbName).collection("users");
  await col.createIndex({ username: 1 }, { unique: true });

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
    await col.updateOne(
      { username: u.username },
      {
        $set: {
          name: u.name,
          role: u.role,
          passwordHash,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    console.log(`Usuario listo: ${u.username} (${u.role})`);
  }
} catch (err) {
  console.error("Error en el seed:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}