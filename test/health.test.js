import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";

test("GET /health returns the required response", async (context) => {
  const server = createApp().listen(0, "127.0.0.1");
  context.after(() => server.close());

  await new Promise((resolve) => server.once("listening", resolve));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
