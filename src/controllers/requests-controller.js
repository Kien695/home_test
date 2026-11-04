import crypto from "node:crypto";
import {
  ALLOWED_SORTS,
  browseRequests,
} from "../repositories/request-browser.js";
import { parseDateRange } from "./report-controller.js";

const cursorSecret =
  process.env.CURSOR_SECRET || crypto.randomBytes(32).toString("hex");

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parsePositiveInteger(value, name, { maximum } = {}) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw badRequest(`${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw badRequest(`${name} must be a positive integer`);
  }
  if (maximum !== undefined && parsed > maximum) {
    throw badRequest(`${name} must not exceed ${maximum}`);
  }
  return parsed;
}

function parseBoolean(value, name) {
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") {
    throw badRequest(`${name} must be true or false`);
  }
  return value === "true";
}

export function createCursorCodec(secret = cursorSecret) {
  function encode(value) {
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  function decode(value) {
    try {
      const parts = value.split(".");
      if (parts.length !== 2) throw new Error("invalid cursor parts");
      const [payload, signature] = parts;
      const expected = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");
      const actualBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);
      if (
        actualBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
      ) {
        throw new Error("invalid cursor signature");
      }
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (
        typeof decoded.snapshot !== "string" ||
        !Number.isSafeInteger(decoded.offset) ||
        decoded.offset < 1
      ) {
        throw new Error("invalid cursor payload");
      }
      return decoded;
    } catch {
      throw badRequest("Invalid cursor");
    }
  }

  return { encode, decode };
}

const cursorCodec = createCursorCodec();

export function parseRequestsQuery(parameters) {
  const range = parseDateRange(parameters);
  const sort = parameters.sort ?? "id";
  if (!ALLOWED_SORTS.has(sort)) throw badRequest("Invalid sort");

  return {
    ...range,
    site_id: parsePositiveInteger(parameters.site_id, "site_id"),
    responder_id: parsePositiveInteger(
      parameters.responder_id,
      "responder_id",
    ),
    late: parseBoolean(parameters.late, "late"),
    within_target: parseBoolean(parameters.within_target, "within_target"),
    sort,
    limit:
      parsePositiveInteger(parameters.limit, "limit", { maximum: 200 }) ?? 50,
    cursor: parameters.cursor
      ? cursorCodec.decode(parameters.cursor)
      : undefined,
  };
}

export async function requestsController(request, response, next) {
  try {
    const result = await browseRequests(parseRequestsQuery(request.query));
    response.json({
      data: result.data,
      next_cursor: result.next ? cursorCodec.encode(result.next) : null,
    });
  } catch (error) {
    next(error);
  }
}
