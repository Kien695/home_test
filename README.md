# Response-time report: starter kit

The completed Node/Express application is in `app/`. It synchronizes the Helpdesk API into
PostgreSQL/Neon, calculates SLA rows, follows the change feed, exposes the required API, and serves
a responsive dashboard. The original starter remains in `starters/node-express` for reference.

The rules are in the brief on your invitation page. Everything else is here.

```
docs/contract.md    what your app must return (graded automatically)
docs/rules.md       the brief's rules with the exact field names
docs/api.md         the helpdesk API your app reads
starters/           a runnable starter in Node, Rails and Python: pick one
DECISIONS.md        fill this in; it is part of your submission
docker-compose.yml  runs your app
.env.example        copy to .env and paste in your practice API details
```

## Setup

You need Docker (with Compose) and Git.

```bash
git init && git add -A && git commit -m "chore: start from the kit"
cp .env.example .env                 # paste in HELPDESK_URL and HELPDESK_TOKEN
cp -r starters/node-express app      # or starters/rails, or starters/python-fastapi
docker compose up --build            # your app on http://localhost:8080
curl http://localhost:8080/health    # {"ok": true}
docker compose run --rm app test     # your tests, exit 0 = pass
```

### Configuration and database

Copy `.env.example` to `.env` and provide `HELPDESK_URL`, `HELPDESK_TOKEN`, `DATABASE_URL`, and a
long random `CURSOR_SECRET`. No secret is sent to the browser. The container runs migrations at
startup; they can also be run explicitly with `docker compose run --rm app migrate`.

On startup `/health` responds immediately. The worker loads sites, holidays, staff, six months of
requests and every event page, upserts by Helpdesk IDs, and precomputes `report_rows`. `/ready`
remains 503 until this finishes. It then polls `/v1/changes` every 30 seconds, persists the cursor,
retries rate limits using `Retry-After`, and restarts an expired feed cursor after a 410.

Open `http://localhost:8080` for Overview, Requests, and read-only Sites views. All displayed values
come from this application's `/api/*` routes.

Check the API works:

```bash
curl -H "Authorization: Bearer $HELPDESK_TOKEN" "$HELPDESK_URL/v1/statuses"
```

You may replace the starter with your own Node, Rails or Python app. Keep these working:
`docker compose up`, `docker compose run --rm app test`, port 8080, a service named `app`, and
reading `HELPDESK_URL` and `HELPDESK_TOKEN` from the environment. You may add a database or cache
to `docker-compose.yml`.

No Docker? Run the starter directly with those two variables set, but we grade with Docker, so
check it builds before you submit.

## Submitting

1. Commit as you go (at least 5 commits); we read the history.
2. Fill in `DECISIONS.md`.
3. Record a short screen recording (about 3 minutes) of the app, narrated in English.
4. Push to a **public** repo (e.g. GitHub) and paste the link on your invitation page, or zip the
   folder **including `.git`** (leave out `node_modules` and `.env`) and upload it there.

Cap it at 3 hours. Go through the levels in order and say in `DECISIONS.md` what you'd do next.
**Submit even if it's unfinished:** we review everything you did, not only the final result.
A plain table is enough; polish isn't scored. We never reuse submissions as company work.

## PostgreSQL/Neon connection

Set `DATABASE_URL` locally before starting the application. The project does
not create, delete, truncate, or alter existing database tables.

To verify the connection without reading application tables:

```bash
npm run db:check
```

The command runs only `SELECT 1`. Application queries will be added after the
existing Neon schema has been reviewed.
