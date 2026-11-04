import { createApp } from "./app.js";
import { closeDatabasePool } from "./config/database.js";
import { HelpdeskClient } from "./integrations/helpdesk/client.js";
import { Synchronizer } from "./sync/synchronizer.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const app = createApp();
let synchronizer;

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`SLA report listening on http://0.0.0.0:${port}`);
});

if (
  process.env.DATABASE_URL &&
  process.env.HELPDESK_URL &&
  process.env.HELPDESK_TOKEN
) {
  synchronizer = new Synchronizer({ api: new HelpdeskClient() });
  synchronizer.start();
} else {
  console.warn("Helpdesk sync disabled: required environment variables missing");
}

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  synchronizer?.stop();
  server.close(async () => {
    await closeDatabasePool();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
