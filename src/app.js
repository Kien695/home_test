import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(currentDirectory, "..", "public");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.static(publicDirectory));

  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  return app;
}
