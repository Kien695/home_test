function parseDayFirstDate(value) {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function parseLocalDateTime(value) {
  if (!value) return null;
  const [date, time] = value.split(" ");
  return `${parseDayFirstDate(date)} ${time}:00`;
}

export async function upsertSite(client, site) {
  await client.query(
    `INSERT INTO sites (id, name, timezone, business_hours)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       timezone = EXCLUDED.timezone,
       business_hours = EXCLUDED.business_hours,
       updated_at = now()`,
    [site.id, site.name, site.timezone, site.business_hours],
  );
}

export async function upsertHoliday(client, siteId, holiday) {
  await client.query(
    `INSERT INTO holidays (site_id, holiday_date, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (site_id, holiday_date) DO UPDATE SET name = EXCLUDED.name`,
    [siteId, parseDayFirstDate(holiday.date), holiday.name],
  );
}

export async function upsertStaff(client, staff) {
  await client.query(
    `INSERT INTO staff (id, name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
    [staff.id, staff.name],
  );
}

export async function upsertStatus(client, status) {
  await client.query(
    `INSERT INTO statuses (value, label)
     VALUES ($1, $2)
     ON CONFLICT (value) DO UPDATE SET label = EXCLUDED.label`,
    [status.value, status.label],
  );
}

export async function upsertRequest(client, request) {
  await client.query(
    `INSERT INTO requests (
       id, ref, title, location, site_id, status, priority, created_at,
       updated_at, due_on, assignee_id, assignee_name, deleted_at,
       merged_into_id, source_data, assignee, raw, synced_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $15, now()
     )
     ON CONFLICT (id) DO UPDATE SET
       ref = EXCLUDED.ref,
       title = EXCLUDED.title,
       location = EXCLUDED.location,
       site_id = EXCLUDED.site_id,
       status = EXCLUDED.status,
       priority = EXCLUDED.priority,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at,
       due_on = EXCLUDED.due_on,
       assignee_id = EXCLUDED.assignee_id,
       assignee_name = EXCLUDED.assignee_name,
       deleted_at = EXCLUDED.deleted_at,
       merged_into_id = EXCLUDED.merged_into_id,
       source_data = EXCLUDED.source_data,
       assignee = EXCLUDED.assignee,
       raw = EXCLUDED.raw,
       synced_at = now()`,
    [
      request.id,
      request.ref,
      request.title,
      request.location,
      request.site_id,
      request.status,
      request.priority,
      request.created_at,
      request.updated_at,
      request.due_on,
      request.assignee?.id ?? null,
      request.assignee?.name ?? null,
      request.deleted_at,
      request.merged_into_id,
      request,
      request.assignee,
    ],
  );
}

export async function upsertEvent(client, requestId, event) {
  await client.query(
    `INSERT INTO events (
       id, request_id, status, occurred_at, at_epoch, actor_id, actor_name,
       assignee_name, due_at_local, due_at, note, reverts_id, source_data,
       raw, synced_at
     ) VALUES (
       $1, $2, $3, to_timestamp($4), $4, $5, $6, $7, $8, $9, $10, $11,
       $12, $12, now()
     )
     ON CONFLICT (id) DO UPDATE SET
       request_id = EXCLUDED.request_id,
       status = EXCLUDED.status,
       occurred_at = EXCLUDED.occurred_at,
       at_epoch = EXCLUDED.at_epoch,
       actor_id = EXCLUDED.actor_id,
       actor_name = EXCLUDED.actor_name,
       assignee_name = EXCLUDED.assignee_name,
       due_at_local = EXCLUDED.due_at_local,
       due_at = EXCLUDED.due_at,
       note = EXCLUDED.note,
       reverts_id = EXCLUDED.reverts_id,
       source_data = EXCLUDED.source_data,
       raw = EXCLUDED.raw,
       synced_at = now()`,
    [
      event.id,
      requestId,
      event.status,
      event.at,
      event.actor_id,
      event.actor_name,
      event.assignee_name,
      parseLocalDateTime(event.due_at),
      event.due_at,
      event.note,
      event.reverts_id,
      event,
    ],
  );
}

export async function getChangeCursor(client) {
  const result = await client.query(
    "SELECT cursor FROM sync_state WHERE name = $1",
    ["helpdesk_changes"],
  );
  return result.rows[0]?.cursor ?? null;
}

export async function saveChangeCursor(client, cursor) {
  await client.query(
    `INSERT INTO sync_state (name, cursor)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = now()`,
    ["helpdesk_changes", cursor],
  );
}
