import { getDatabasePool } from "../config/database.js";
import {
  getChangeCursor,
  saveChangeCursor,
  upsertEvent,
  upsertHoliday,
  upsertRequest,
  upsertSite,
  upsertStaff,
  upsertStatus,
} from "../repositories/helpdesk.js";
import {
  loadSlaInputs,
  removeSlaRow,
  saveSlaRow,
} from "../repositories/report.js";
import { calculateSlaRow } from "../services/sla.js";

const POLL_INTERVAL_MS = 30_000;

function formatApiDate(date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

function initialSyncRange(now = new Date()) {
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1),
  );
  return { createdFrom: formatApiDate(from), createdTo: formatApiDate(now) };
}

export class Synchronizer {
  constructor({
    api,
    pool = getDatabasePool(),
    pollInterval = POLL_INTERVAL_MS,
    onReady = () => {},
  }) {
    this.api = api;
    this.pool = pool;
    this.pollInterval = pollInterval;
    this.onReady = onReady;
    this.running = false;
    this.stopped = false;
    this.timer = null;
  }

  async syncReferenceData() {
    const [sites, staff, statuses] = await Promise.all([
      this.api.get("/v1/sites"),
      this.api.get("/v1/staff"),
      this.api.get("/v1/statuses"),
    ]);

    for (const site of sites.data) {
      const holidays = await this.api.get(`/v1/sites/${site.id}/holidays`);
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await upsertSite(client, site);
        for (const holiday of holidays.data) {
          await upsertHoliday(client, site.id, holiday);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const person of staff.data) await upsertStaff(client, person);
      for (const status of statuses.data) await upsertStatus(client, status);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async fetchAllEvents(requestId) {
    const events = [];
    for (let page = 1; ; page += 1) {
      const response = await this.api.get(`/v1/requests/${requestId}/events`, {
        page,
      });
      events.push(...response.data);
      if (!response.has_more) return events;
    }
  }

  async storeRequest(request, events = null) {
    const allEvents = events ?? (await this.fetchAllEvents(request.id));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await upsertRequest(client, request);
      for (const event of allEvents) {
        await upsertEvent(client, request.id, event);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await this.recomputeSla(request.id);
  }

  async recomputeSla(requestId) {
    const input = await loadSlaInputs(this.pool, requestId);
    if (!input) return;

    const row = calculateSlaRow(input);
    if (row) await saveSlaRow(this.pool, row);
    else await removeSlaRow(this.pool, requestId);
  }

  async initialSync(now = new Date()) {
    await this.syncReferenceData();
    const range = initialSyncRange(now);

    for (let page = 1; ; page += 1) {
      const response = await this.api.get("/v1/requests", {
        page,
        per_page: 100,
        created_from: range.createdFrom,
        created_to: range.createdTo,
      });
      for (const request of response.data) await this.storeRequest(request);
      if (page >= response.total_pages) break;
    }
  }

  async processChange(change) {
    if (change.type.startsWith("request.") && change.request) {
      await this.storeRequest(change.request, []);
      return;
    }

    if (change.type === "event.created" && change.event) {
      const response = await this.api.get(`/v1/requests/${change.request_id}`);
      await this.storeRequest(response.data ?? response, [change.event]);
      return;
    }

    if (change.type === "staff.updated" && change.staff) {
      await upsertStaff(this.pool, change.staff);
      const affected = await this.pool.query(
        "SELECT request_id FROM report_rows WHERE responder_id = $1",
        [change.staff.id],
      );
      for (const row of affected.rows) await this.recomputeSla(row.request_id);
    }
  }

  async pollChanges() {
    let cursor = await getChangeCursor(this.pool);

    for (;;) {
      let response;
      try {
        response = await this.api.get("/v1/changes", {
          cursor: cursor ?? undefined,
          limit: 500,
        });
      } catch (error) {
        if (error.status !== 410) throw error;
        cursor = null;
        await saveChangeCursor(this.pool, null);
        continue;
      }

      for (const change of response.data) await this.processChange(change);
      cursor = response.next_cursor;
      await saveChangeCursor(this.pool, cursor);
      if (!response.has_more) return;
    }
  }

  async runCycle() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.pollChanges();
    } finally {
      this.running = false;
    }
  }

  scheduleNextPoll() {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      try {
        await this.runCycle();
      } catch (error) {
        console.error("Helpdesk change sync failed", error);
      } finally {
        this.scheduleNextPoll();
      }
    }, this.pollInterval);
  }

  async start() {
    this.stopped = false;
    try {
      await this.initialSync();
      this.onReady();
      await this.runCycle();
      this.scheduleNextPoll();
    } catch (error) {
      console.error("Initial Helpdesk sync failed", error);
      if (!this.stopped) {
        this.timer = setTimeout(() => this.start(), this.pollInterval);
      }
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}

export { formatApiDate, initialSyncRange };
