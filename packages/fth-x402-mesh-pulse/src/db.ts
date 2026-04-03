import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5442),
  database: process.env.PGDATABASE ?? "fth_x402",
  user: process.env.PGUSER ?? "fth_x402_app",
  password: process.env.PGPASSWORD,
  max: 15,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export default pool;
