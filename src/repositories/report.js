import { query } from "./database.js";

export async function loadSlaInputs(client, requestId) {
  const requestResult = await client.query(
    `SELECT r.source_data AS request, s.id AS site_id, s.timezone,
            s.business_hours
     FROM requests r
     JOIN sites s ON s.id = r.site_id
     WHERE r.id = $1`,
    [requestId],
  );
  if (requestResult.rowCount === 0) return null;

  const [eventsResult, holidaysResult, staffResult] = await Promise.all([
    client.query(
      `SELECT source_data
       FROM events
       WHERE request_id = $1
       ORDER BY occurred_at, id`,
      [requestId],
    ),
    client.query(
      `SELECT holiday_date::text AS holiday_date
       FROM holidays
       WHERE site_id = $1`,
      [requestResult.rows[0].site_id],
    ),
    client.query("SELECT id, name FROM staff"),
  ]);

  const input = requestResult.rows[0];
  return {
    request: input.request,
    events: eventsResult.rows.map((row) => row.source_data),
    site: {
      id: Number(input.site_id),
      timezone: input.timezone,
      business_hours: input.business_hours,
    },
    holidays: new Set(
      holidaysResult.rows.map((row) => row.holiday_date),
    ),
    staff: new Map(
      staffResult.rows.map((row) => [Number(row.id), row.name]),
    ),
  };
}

export async function saveSlaRow(client, row) {
  await client.query(
    `INSERT INTO report_rows (
       request_id, site_id, responder_id, responder,
       response_business_minutes, within_target, completed_late,
       created_local_date, calculated_at, computed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
     ON CONFLICT (request_id) DO UPDATE SET
       site_id = EXCLUDED.site_id,
       responder_id = EXCLUDED.responder_id,
       responder = EXCLUDED.responder,
       response_business_minutes = EXCLUDED.response_business_minutes,
       within_target = EXCLUDED.within_target,
       completed_late = EXCLUDED.completed_late,
       created_local_date = EXCLUDED.created_local_date,
       calculated_at = now(),
       computed_at = now()`,
    [
      row.request_id,
      row.site_id,
      row.responder_id,
      row.responder,
      row.response_business_minutes,
      row.within_target,
      row.completed_late,
      row.created_local_date,
    ],
  );
}

export async function removeSlaRow(client, requestId) {
  await client.query("DELETE FROM report_rows WHERE request_id = $1", [requestId]);
}

function normalizeReportRow(row) {
  return {
    id: Number(row.id),
    site_id: Number(row.site_id),
    responder_id: row.responder_id == null ? null : Number(row.responder_id),
    responder: row.responder,
    response_business_minutes: row.response_business_minutes,
    within_target: row.within_target,
    completed_late: row.completed_late,
  };
}

export async function getSlaReport(from, to) {
  const result = await query(
    `SELECT request_id AS id, site_id, responder_id, responder,
            response_business_minutes, within_target, completed_late
     FROM report_rows
     WHERE created_local_date BETWEEN $1 AND $2
     ORDER BY request_id`,
    [from, to],
  );
  const requests = result.rows.map(normalizeReportRow);
  const respondersById = new Map();

  for (const row of requests) {
    if (row.responder_id == null) continue;
    const responder = respondersById.get(row.responder_id) ?? {
      id: row.responder_id,
      name: row.responder,
      requests: 0,
      within_target: 0,
      completed_late: 0,
    };
    responder.requests += 1;
    if (row.within_target === true) responder.within_target += 1;
    if (row.completed_late === true) responder.completed_late += 1;
    respondersById.set(row.responder_id, responder);
  }

  return {
    from,
    to,
    requests,
    responders: [...respondersById.values()].sort(
      (left, right) => left.id - right.id,
    ),
  };
}
