import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCursorCodec,
  parseRequestsQuery,
} from "../src/controllers/requests-controller.js";

test("request browsing applies contract defaults", () => {
  assert.deepEqual(
    parseRequestsQuery({ from: "2026-10-01", to: "2026-10-31" }),
    {
      from: "2026-10-01",
      to: "2026-10-31",
      site_id: undefined,
      responder_id: undefined,
      late: undefined,
      within_target: undefined,
      sort: "id",
      limit: 50,
      cursor: undefined,
    },
  );
});

test("request browsing parses every filter", () => {
  const result = parseRequestsQuery({
    from: "2026-10-01",
    to: "2026-10-31",
    site_id: "11",
    responder_id: "304",
    late: "false",
    within_target: "true",
    sort: "-response_business_minutes",
    limit: "200",
    ignored: "value",
  });

  assert.equal(result.site_id, 11);
  assert.equal(result.responder_id, 304);
  assert.equal(result.late, false);
  assert.equal(result.within_target, true);
  assert.equal(result.sort, "-response_business_minutes");
  assert.equal(result.limit, 200);
  assert.equal(result.ignored, undefined);
});

test("request browsing rejects invalid values", () => {
  const base = { from: "2026-10-01", to: "2026-10-31" };
  for (const invalid of [
    { site_id: "0" },
    { responder_id: "1.5" },
    { late: "yes" },
    { within_target: "1" },
    { sort: "title" },
    { limit: "0" },
    { limit: "201" },
  ]) {
    assert.throws(() => parseRequestsQuery({ ...base, ...invalid }));
  }
});

test("cursor codec accepts issued cursors and rejects tampering", () => {
  const codec = createCursorCodec("test-secret");
  const cursor = codec.encode({ snapshot: "snapshot-id", offset: 50 });

  assert.deepEqual(codec.decode(cursor), {
    snapshot: "snapshot-id",
    offset: 50,
  });
  assert.throws(() => codec.decode(`${cursor}x`), /Invalid cursor/);
  assert.throws(
    () => createCursorCodec("other-secret").decode(cursor),
    /Invalid cursor/,
  );
});
