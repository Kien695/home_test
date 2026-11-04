import { closeDatabasePool } from "../config/database.js";
import { checkDatabaseConnection } from "../repositories/database.js";

try {
  const connected = await checkDatabaseConnection();

  if (!connected) {
    throw new Error("PostgreSQL connection check returned an invalid result");
  }

  console.log("PostgreSQL connection successful");
} catch (error) {
  console.error(`PostgreSQL connection failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDatabasePool();
}
