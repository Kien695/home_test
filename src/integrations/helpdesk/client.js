const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 8;

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class HelpdeskError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "HelpdeskError";
    this.status = status;
    this.body = body;
  }
}

export class HelpdeskClient {
  constructor({
    baseUrl = process.env.HELPDESK_URL,
    token = process.env.HELPDESK_TOKEN,
    fetchImpl = globalThis.fetch,
    waitImpl = wait,
  } = {}) {
    if (!baseUrl) throw new Error("HELPDESK_URL is required");
    if (!token) throw new Error("HELPDESK_TOKEN is required");

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.fetch = fetchImpl;
    this.wait = waitImpl;
  }

  async get(pathname, parameters = {}) {
    const url = new URL(`${this.baseUrl}${pathname}`);

    for (const [name, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(name, String(value));
      }
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const response = await this.fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (response.ok) return response.json();

      if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delaySeconds = Number.isFinite(retryAfter)
          ? Math.max(retryAfter, 0)
          : Math.min(2 ** attempt, 30);
        await this.wait(delaySeconds * 1_000);
        continue;
      }

      const body = await response.text();
      throw new HelpdeskError(
        `Helpdesk GET ${url.pathname} failed with status ${response.status}`,
        { status: response.status, body },
      );
    }

    throw new HelpdeskError(`Helpdesk GET ${url.pathname} exhausted retries`);
  }
}
