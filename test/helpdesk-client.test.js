import assert from "node:assert/strict";
import { test } from "node:test";
import { HelpdeskClient, HelpdeskError } from "../src/integrations/helpdesk/client.js";

test("Helpdesk client sends authorization and query parameters", async () => {
  let capturedUrl;
  let capturedOptions;
  const client = new HelpdeskClient({
    baseUrl: "https://helpdesk.example.test/",
    token: "test-token",
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });

  await client.get("/v1/requests", { page: 2, per_page: 100 });

  assert.equal(capturedUrl.pathname, "/v1/requests");
  assert.equal(capturedUrl.searchParams.get("page"), "2");
  assert.equal(capturedUrl.searchParams.get("per_page"), "100");
  assert.equal(capturedOptions.headers.Authorization, "Bearer test-token");
});

test("Helpdesk client honors Retry-After after a 429", async () => {
  let calls = 0;
  const waits = [];
  const client = new HelpdeskClient({
    baseUrl: "https://helpdesk.example.test",
    token: "test-token",
    waitImpl: async (milliseconds) => waits.push(milliseconds),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "3" },
        });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });

  await client.get("/v1/sites");

  assert.equal(calls, 2);
  assert.deepEqual(waits, [3_000]);
});

test("Helpdesk client exposes non-success status", async () => {
  const client = new HelpdeskClient({
    baseUrl: "https://helpdesk.example.test",
    token: "test-token",
    fetchImpl: async () => new Response("gone", { status: 410 }),
  });

  await assert.rejects(
    () => client.get("/v1/changes"),
    (error) => error instanceof HelpdeskError && error.status === 410,
  );
});
