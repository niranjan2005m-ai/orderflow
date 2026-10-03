import { Pool } from 'pg';

// One connection pool shared across all gRPC handler calls.
// pg.Pool manages multiple connections and re-uses them efficiently.
export const pool = new Pool({
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5433', 10),
  user:     process.env.POSTGRES_USER     || 'orderflow',
  password: process.env.POSTGRES_PASSWORD || 'orderflow_secret',
  database: process.env.POSTGRES_DB       || 'orderflow',
});
