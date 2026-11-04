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

test("GET /ready reflects synchronization readiness", async (context) => {
  const readiness = { ready: false };
  const server = createApp({ readiness }).listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();

  const unavailable = await fetch(
    `http://127.0.0.1:${address.port}/ready`,
  );
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { ready: false });

  readiness.ready = true;
  const available = await fetch(`http://127.0.0.1:${address.port}/ready`);
  assert.equal(available.status, 200);
  assert.deepEqual(await available.json(), { ready: true });
});

test("SLA report rejects an invalid local date range", async (context) => {
  const server = createApp().listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();

  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/sla-report?from=2026-10-31&to=2026-10-01`,
  );
  assert.equal(response.status, 400);
});
