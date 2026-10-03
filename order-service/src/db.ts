import { Pool } from 'pg';

// One connection pool for regular SELECT/UPDATE queries.
// For the CreateOrder transaction we check out a single client from this pool
// so that BEGIN / INSERT / INSERT / COMMIT all run on the same connection.
export const pool = new Pool({
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user:     process.env.POSTGRES_USER     || 'orderflow',
  password: process.env.POSTGRES_PASSWORD || 'orderflow_secret',
  database: process.env.POSTGRES_DB       || 'orderflow',
});
