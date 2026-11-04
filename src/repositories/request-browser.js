import crypto from "node:crypto";
import { query } from "./database.js";

export const ALLOWED_SORTS = new Set([
  "id",
  "-id",
  "response_business_minutes",
  "-response_business_minutes",
]);

function normalizeRow(row) {
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

export function requestQueryHash(parameters) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        from: parameters.from,
        to: parameters.to,
        site_id: parameters.site_id ?? null,
        responder_id: parameters.responder_id ?? null,
        late: parameters.late ?? null,
        within_target: parameters.within_target ?? null,
        sort: parameters.sort,
      }),
    )
    .digest("hex");
}

function sortClause(sort) {
  switch (sort) {
    case "-id":
      return "request_id DESC";
    case "response_business_minutes":
      return "response_business_minutes ASC NULLS LAST, request_id ASC";
    case "-response_business_minutes":
      return "response_business_minutes DESC NULLS LAST, request_id ASC";
    default:
      return "request_id ASC";
  }
}

async function createSnapshot(parameters, queryHash) {
  const where = ["created_local_date BETWEEN $1 AND $2"];
  const values = [parameters.from, parameters.to];

  for (const [column, value] of [
    ["site_id", parameters.site_id],
    ["responder_id", parameters.responder_id],
    ["completed_late", parameters.late],
    ["within_target", parameters.within_target],
  ]) {
    if (value !== undefined) {
      values.push(value);
      where.push(`${column} = $${values.length}`);
    }
  }

  const result = await query(
    `SELECT request_id
     FROM report_rows
     WHERE ${where.join(" AND ")}
     ORDER BY ${sortClause(parameters.sort)}`,
    values,
  );
  const rowIds = result.rows.map((row) => Number(row.request_id));
  const snapshotId = crypto.randomUUID();

  await query(
    "DELETE FROM page_snapshots WHERE created_at < now() - interval '15 minutes'",
  );
  await query(
    `INSERT INTO page_snapshots (id, query_hash, row_ids)
     VALUES ($1, $2, $3)`,
    [snapshotId, queryHash, rowIds],
  );

  return { snapshotId, rowIds };
}

async function loadSnapshot(snapshotId, expectedHash) {
  const result = await query(
    `SELECT query_hash, row_ids
     FROM page_snapshots
     WHERE id = $1 AND created_at > now() - interval '15 minutes'`,
    [snapshotId],
  );
  if (result.rowCount === 0 || result.rows[0].query_hash !== expectedHash) {
    const error = new Error("Invalid cursor");
    error.status = 400;
    throw error;
  }
  return result.rows[0].row_ids.map(Number);
}

export async function browseRequests(parameters) {
  const queryHash = requestQueryHash(parameters);
  let snapshotId = parameters.cursor?.snapshot;
  let offset = parameters.cursor?.offset ?? 0;
  let rowIds;

  if (snapshotId) {
    rowIds = await loadSnapshot(snapshotId, queryHash);
  } else {
    ({ snapshotId, rowIds } = await createSnapshot(parameters, queryHash));
  }

  const pageIds = rowIds.slice(offset, offset + parameters.limit);
  let data = [];

  if (pageIds.length > 0) {
    const result = await query(
      `SELECT request_id AS id, site_id, responder_id, responder,
              response_business_minutes, within_target, completed_late
       FROM report_rows
       WHERE request_id = ANY($1::bigint[])`,
      [pageIds],
    );
    const rowsById = new Map(
      result.rows.map((row) => [Number(row.id), normalizeRow(row)]),
    );
    data = pageIds.map((id) => rowsById.get(id)).filter(Boolean);
  }

  offset += pageIds.length;
  return {
    data,
    total: rowIds.length,
    next:
      offset < rowIds.length
        ? { snapshot: snapshotId, offset }
        : null,
  };
}
