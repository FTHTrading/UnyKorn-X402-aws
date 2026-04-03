import { Pool } from "pg";

if (!process.env.PGPASSWORD && process.env.NODE_ENV === "production") {
  console.error("[Treasury DB] FATAL: PGPASSWORD is required in production");
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "fth_x402",
  user: process.env.PGUSER ?? "fth",
  password: process.env.PGPASSWORD ?? "fth_dev",
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export default pool;