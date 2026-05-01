import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { BugSnapshot } from "./types.js";

function normalizeHeaders(raw: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toLowerCase();
    if (["content-length", "transfer-encoding", "connection", "set-cookie"].includes(key)) {
      continue;
    }
    output[key] = String(v);
  }
  return output;
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function bodyToText(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  if (body === undefined) {
    return "";
  }
  return JSON.stringify(body);
}

function parseRequestPath(req: IncomingMessage): string {
  if (!req.url) {
    return "/";
  }
  const parsed = new URL(req.url, "http://localhost");
  return parsed.pathname;
}

export function startReplaySandbox(snapshot: BugSnapshot, port: number): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const requestPath = parseRequestPath(req);
      const expectedPath = snapshot.request.path;
      const expectedMethod = snapshot.request.method.toUpperCase();
      const actualMethod = (req.method ?? "GET").toUpperCase();

      if (requestPath === "/health") {
        return writeJson(res, 200, { ok: true, snapshotId: snapshot.id });
      }

      if (requestPath !== expectedPath || actualMethod !== expectedMethod) {
        return writeJson(res, 404, {
          error: "No route in replay sandbox",
          expected: { method: expectedMethod, path: expectedPath },
          received: { method: actualMethod, path: requestPath }
        });
      }

      const headers = normalizeHeaders(snapshot.response.headers);
      const contentType = headers["content-type"] ?? "application/json; charset=utf-8";
      const body = bodyToText(snapshot.response.body);

      res.writeHead(snapshot.response.status, {
        ...headers,
        "x-replay-snapshot-id": snapshot.id,
        "content-type": contentType
      });
      res.end(body);
    });

    server.listen(port, () => {
      process.stdout.write(`Replay sandbox running on http://localhost:${port}\n`);
      process.stdout.write(`Expected route: ${snapshot.request.method.toUpperCase()} ${snapshot.request.path}\n`);
      resolve();
    });
  });
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildTargetUrl(baseUrl: string, path: string, query: Record<string, unknown>): string {
  const target = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      target.searchParams.set(key, String(value));
    }
  }
  return target.toString();
}

export async function runReplay(snapshot: BugSnapshot, baseUrl: string, timeoutMs: number): Promise<void> {
  const url = buildTargetUrl(baseUrl, snapshot.request.path, snapshot.request.query);
  const headers = normalizeHeaders(snapshot.request.headers);
  delete headers.host;
  delete headers.authorization;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: snapshot.request.method.toUpperCase(),
      headers,
      body: ["GET", "HEAD"].includes(snapshot.request.method.toUpperCase())
        ? undefined
        : bodyToText(snapshot.request.body),
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") ?? "";
    const actualBody = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    const sameStatus = response.status === snapshot.response.status;
    const sameBody = deepEqual(actualBody, snapshot.response.body);

    const summary = {
      snapshotId: snapshot.id,
      target: url,
      expected: { status: snapshot.response.status, body: snapshot.response.body },
      actual: { status: response.status, body: actualBody },
      match: sameStatus && sameBody
    };

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    clearTimeout(timer);
  }
}
