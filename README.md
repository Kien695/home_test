# SLA Performance Report

Node.js/Express application that synchronizes a Helpdesk API into an existing
PostgreSQL/Neon database, calculates response and completion SLA metrics, and
serves a responsive dashboard.

## Requirements

- Node.js 22 or later
- npm
- An existing PostgreSQL/Neon schema with the required application tables
- Helpdesk API URL and bearer token
- Docker with Compose (optional)

The application does not create, truncate, drop, or alter database tables.

## Configuration

Copy `.env.example` to `.env` and set local values:

```dotenv
PORT=8080
HELPDESK_URL=
HELPDESK_TOKEN=
DATABASE_URL=
CURSOR_SECRET=
```

`CURSOR_SECRET` should be a long random value and must remain stable while
clients walk paginated results. Never commit `.env` or real credentials.

## Install and run

```bash
npm install
npm test
npm start
```

The dashboard is available at `http://localhost:8080`.

To verify only the database connection:

```bash
npm run db:check
```

Development mode with automatic restart:

```bash
npm run dev
```

## Docker

```bash
docker compose up --build
```

The Compose service is named `app` and exposes port 8080.

## Synchronization

At startup the worker:

1. Loads sites, holidays, staff, and statuses.
2. Loads six months of requests using every request page.
3. Loads every event page for each request.
4. Upserts source records and precomputes SLA report rows.
5. Marks `/ready` as ready.
6. Polls the Helpdesk change feed every 30 seconds.

Primary-key upserts make repeated change records safe. A `429` response honors
`Retry-After`. When a change cursor expires with `410`, synchronization restarts
the feed without a cursor and relies on idempotent upserts.

## HTTP API

### `GET /health`

Available immediately after the HTTP server starts:

```json
{"ok":true}
```

### `GET /ready`

Returns `503 {"ready":false}` during initial synchronization and
`200 {"ready":true}` when six months of reports are available.

### `GET /api/sla-report`

Required parameters:

- `from`: `YYYY-MM-DD`
- `to`: `YYYY-MM-DD`

Example:

```bash
curl "http://localhost:8080/api/sla-report?from=2026-10-01&to=2026-10-31"
```

### `GET /api/requests`

Required parameters:

- `from`, `to`: inclusive local-date range

Optional parameters:

- `site_id`
- `responder_id`
- `late=true|false`
- `within_target=true|false`
- `sort=id|-id|response_business_minutes|-response_business_minutes`
- `limit=1..200` (default 50)
- `cursor`: opaque cursor returned by the previous page

Unknown parameters are ignored. Invalid filters, dates, limits, sorts, and
cursors return HTTP 400. Pagination snapshots expire after 15 minutes.
The response also includes `X-Total-Count` and `X-Total-Pages` headers for the
dashboard without changing the contract JSON body.

### `GET /api/sites`

Returns site IDs and current site names for the dashboard. This additive UI
endpoint does not change the graded report or request response shapes.

## Project structure

```text
public/                         dashboard assets
src/config/                     PostgreSQL pool
src/controllers/                HTTP validation and response handlers
src/integrations/helpdesk/      Helpdesk API client
src/repositories/               PostgreSQL queries and upserts
src/services/                   SLA calculation rules
src/sync/                       initial sync and change-feed worker
test/                           Node test suite
```

## Security notes

- Helpdesk and database credentials remain server-side.
- Pagination cursors are signed with HMAC.
- SQL values use parameterized queries.
- The dashboard renders API values as text rather than injecting HTML.
