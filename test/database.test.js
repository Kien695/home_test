import assert from "node:assert/strict";
import { test } from "node:test";
import { createDatabasePool } from "../src/config/database.js";

test("database pool requires DATABASE_URL", () => {
  assert.throws(
    () => createDatabasePool({ connectionString: "" }),
    /DATABASE_URL is required/,
  );
});

test("database pool uses bounded connection settings", () => {
  let receivedOptions;

  class FakePool {
    constructor(options) {
      receivedOptions = options;
    }
  }

  const createdPool = createDatabasePool({
    connectionString: "postgresql://user:password@example.test/database",
    PoolClass: FakePool,
  });

  assert.ok(createdPool instanceof FakePool);
  assert.deepEqual(receivedOptions, {
    connectionString: "postgresql://user:password@example.test/database",
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
});
