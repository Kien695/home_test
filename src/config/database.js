import pg from "pg";

const { Pool } = pg;

let pool;

export function createDatabasePool({
  connectionString = process.env.DATABASE_URL,
  PoolClass = Pool,
} = {}) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new PoolClass({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export function getDatabasePool() {
  if (!pool) {
    pool = createDatabasePool();
    pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL pool error", error);
    });
  }

  return pool;
}

export async function closeDatabasePool() {
  if (!pool) return;

  const activePool = pool;
  pool = undefined;
  await activePool.end();
}
