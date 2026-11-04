import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slaReportController } from "./controllers/report-controller.js";
import { requestsController } from "./controllers/requests-controller.js";
import { sitesController } from "./controllers/sites-controller.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(currentDirectory, "..", "public");

export function createApp({ readiness = { ready: false } } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.static(publicDirectory));

  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.get("/ready", (_request, response) => {
    response
      .status(readiness.ready ? 200 : 503)
      .json({ ready: readiness.ready });
  });

  app.get("/api/sla-report", slaReportController);
  app.get("/api/requests", requestsController);
  app.get("/api/sites", sitesController);

  app.use((error, _request, response, _next) => {
    if (error.status === 400) {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    response.status(503).json({ error: "Service temporarily unavailable" });
  });

  return app;
}
