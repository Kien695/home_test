import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateBusinessMinutes,
  calculateSlaRow,
} from "../src/services/sla.js";

const weekdayHours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: null,
  sun: null,
};
const site = {
  id: 11,
  timezone: "Asia/Singapore",
  business_hours: weekdayHours,
};

const epoch = (iso) => Date.parse(iso) / 1_000;

function baseRequest(overrides = {}) {
  return {
    id: 1,
    site_id: 11,
    status: "processing",
    priority: "High",
    created_at: "2026-10-12T01:00:00Z",
    deleted_at: null,
    merged_into_id: null,
    ...overrides,
  };
}

test("business minutes exclude nights, weekends, and holidays", () => {
  const parameters = {
    createdAt: "2026-10-09T09:00:00Z",
    responseEpoch: epoch("2026-10-12T03:00:00Z"),
    timezone: site.timezone,
    businessHours: site.business_hours,
  };

  assert.equal(calculateBusinessMinutes(parameters), 180);
  assert.equal(
    calculateBusinessMinutes({
      ...parameters,
      holidays: new Set(["2026-10-12"]),
    }),
    60,
  );
});

test("business seconds are summed before flooring to minutes", () => {
  assert.equal(
    calculateBusinessMinutes({
      createdAt: "2026-10-12T01:00:00Z",
      responseEpoch: epoch("2026-10-12T01:59:59Z"),
      timezone: site.timezone,
      businessHours: site.business_hours,
    }),
    59,
  );
});

test("response before request creation has zero business minutes", () => {
  assert.equal(
    calculateBusinessMinutes({
      createdAt: "2026-10-12T02:00:00Z",
      responseEpoch: epoch("2026-10-12T01:00:00Z"),
      timezone: site.timezone,
      businessHours: site.business_hours,
    }),
    0,
  );
});

test("local business clocks account for daylight-saving transitions", () => {
  assert.equal(
    calculateBusinessMinutes({
      createdAt: "2026-03-08T06:00:00Z",
      responseEpoch: epoch("2026-03-08T08:00:00Z"),
      timezone: "America/New_York",
      businessHours: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: { open: "01:00", close: "04:00" },
      },
    }),
    120,
  );
});

test("reverted response and reverting event are both ignored", () => {
  const row = calculateSlaRow({
    request: baseRequest(),
    events: [
      {
        id: 10,
        status: "processing",
        at: epoch("2026-10-12T01:30:00Z"),
        actor_id: 7,
      },
      {
        id: 11,
        status: "pending",
        at: epoch("2026-10-12T01:40:00Z"),
        actor_id: 8,
        reverts_id: 10,
      },
    ],
    site,
    holidays: new Set(),
    staff: new Map([[7, "Current Name"]]),
  });

  assert.equal(row.responder_id, null);
  assert.equal(row.response_business_minutes, null);
  assert.equal(row.within_target, null);
});

test("first human processing event uses the current staff name", () => {
  const row = calculateSlaRow({
    request: baseRequest(),
    events: [
      {
        id: 1,
        status: "processing",
        at: epoch("2026-10-12T01:10:00Z"),
        actor_id: null,
        actor_name: "System",
      },
      {
        id: 2,
        status: "processing",
        at: epoch("2026-10-12T02:00:00Z"),
        actor_id: 7,
        actor_name: "Old Name",
      },
    ],
    site,
    holidays: new Set(),
    staff: new Map([[7, "Current Name"]]),
  });

  assert.equal(row.responder_id, 7);
  assert.equal(row.responder, "Current Name");
  assert.equal(row.response_business_minutes, 60);
  assert.equal(row.within_target, true);
});

test("target comparison is inclusive and null priority uses 480 minutes", () => {
  const row = calculateSlaRow({
    request: baseRequest({ priority: null }),
    events: [
      {
        id: 1,
        status: "processing",
        at: epoch("2026-10-12T09:00:00Z"),
        actor_id: 7,
      },
    ],
    site,
    holidays: new Set(),
    staff: new Map([[7, "Responder"]]),
  });

  assert.equal(row.response_business_minutes, 480);
  assert.equal(row.within_target, true);
});

test("last completion is compared strictly with the latest deadline", () => {
  const row = calculateSlaRow({
    request: baseRequest(),
    events: [
      {
        id: 1,
        status: "processing",
        at: epoch("2026-10-12T01:30:00Z"),
        actor_id: 7,
        due_at: "12/10/2026 12:00",
      },
      {
        id: 2,
        status: "complete",
        at: epoch("2026-10-12T04:00:00Z"),
        actor_id: 7,
      },
      {
        id: 3,
        status: "processing",
        at: epoch("2026-10-12T04:30:00Z"),
        actor_id: 7,
        due_at: "12/10/2026 13:00",
      },
      {
        id: 4,
        status: "complete",
        at: epoch("2026-10-12T05:00:01Z"),
        actor_id: 7,
      },
    ],
    site,
    holidays: new Set(),
    staff: new Map([[7, "Responder"]]),
  });

  assert.equal(row.completed_late, true);
});

test("missing response and completion information produce contract nulls", () => {
  const row = calculateSlaRow({
    request: baseRequest({ created_at: "2026-10-11T17:30:00Z" }),
    events: [],
    site,
    holidays: new Set(),
    staff: new Map(),
  });

  assert.equal(row.created_local_date, "2026-10-12");
  assert.equal(row.responder_id, null);
  assert.equal(row.responder, null);
  assert.equal(row.response_business_minutes, null);
  assert.equal(row.within_target, null);
  assert.equal(row.completed_late, null);
});

test("canceled, deleted, and merged requests are excluded", () => {
  const input = {
    events: [],
    site,
    holidays: new Set(),
    staff: new Map(),
  };

  assert.equal(
    calculateSlaRow({ ...input, request: baseRequest({ status: "canceled" }) }),
    null,
  );
  assert.equal(
    calculateSlaRow({
      ...input,
      request: baseRequest({ deleted_at: "2026-10-12T01:00:00Z" }),
    }),
    null,
  );
  assert.equal(
    calculateSlaRow({ ...input, request: baseRequest({ merged_into_id: 2 }) }),
    null,
  );
});
