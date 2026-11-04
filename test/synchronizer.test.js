import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialSyncRange,
  Synchronizer,
} from "../src/sync/synchronizer.js";

test("initial sync starts on the first day six months earlier", () => {
  assert.deepEqual(initialSyncRange(new Date("2026-11-04T12:00:00Z")), {
    createdFrom: "01/05/2026",
    createdTo: "04/11/2026",
  });
});

test("change polling restarts after an expired cursor", async () => {
  const savedCursors = [];
  const requestedCursors = [];
  let feedCalls = 0;
  const pool = {
    async query(text, values) {
      if (text.startsWith("SELECT cursor")) {
        return { rows: [{ cursor: "expired-cursor" }] };
      }
      savedCursors.push(values[1]);
      return { rows: [] };
    },
  };
  const api = {
    async get(pathname, parameters) {
      assert.equal(pathname, "/v1/changes");
      requestedCursors.push(parameters.cursor);
      feedCalls += 1;
      if (feedCalls === 1) throw Object.assign(new Error("expired"), { status: 410 });
      return {
        data: [],
        next_cursor: "fresh-cursor",
        has_more: false,
      };
    },
  };
  const synchronizer = new Synchronizer({ api, pool });

  await synchronizer.pollChanges();

  assert.deepEqual(requestedCursors, ["expired-cursor", undefined]);
  assert.deepEqual(savedCursors, [null, "fresh-cursor"]);
});
