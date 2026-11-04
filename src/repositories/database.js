import { getDatabasePool } from "../config/database.js";

export async function query(text, values = []) {
  return getDatabasePool().query(text, values);
}

export async function withTransaction(callback) {
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection() {
  const result = await query("SELECT 1 AS connected");
  return result.rows[0]?.connected === 1;
}
