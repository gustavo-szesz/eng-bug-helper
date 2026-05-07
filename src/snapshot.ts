import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BugInput, BugInputSchema, BugSnapshot, BugSnapshotSchema } from "./types.js";

const REDACTED = "***REDACTED***";
const SENSITIVE_KEY = /(authorization|token|secret|password|api[-_]?key|email|phone|cpf|cnpj)/i;
const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const DIGIT_ID_PATTERN = /\b\d{9,14}\b/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function sanitizeString(value: string): string {
  const maskedBearer = value.replace(BEARER_PATTERN, "Bearer ***");
  const maskedEmails = maskedBearer.replace(EMAIL_PATTERN, (_, _local, domain: string) => `***@${domain}`);
  return maskedEmails.replace(DIGIT_ID_PATTERN, "***");
}

function sanitizeValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && SENSITIVE_KEY.test(keyHint)) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === "object" && value !== null) {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(input)) {
      output[key] = sanitizeValue(raw, key);
    }
    return output;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  return value;
}
 
function nowId(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return `bug-${stamp}-${random}`;
}

function toPathAndQuery(urlRaw: string): { path: string; query: Record<string, string> } {
  const parsed = new URL(urlRaw);
  const query: Record<string, string> = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    query[key] = value;
  }
  return { path: parsed.pathname, query };
}

export async function createSnapshot(inputPath: string, outputPath?: string): Promise<string> {
  const file = await readFile(resolve(inputPath), "utf-8");
  const parsedInput: BugInput = BugInputSchema.parse(JSON.parse(file));

  const id = nowId();
  const { path, query } = toPathAndQuery(parsedInput.request.url);
  const snapshot: BugSnapshot = {
    id,
    createdAt: new Date().toISOString(),
    title: parsedInput.title,
    source: parsedInput.source,
    user: toObject(sanitizeValue(parsedInput.user)),
    metadata: toObject(sanitizeValue(parsedInput.metadata)),
    request: {
      ...parsedInput.request,
      headers: toObject(sanitizeValue(parsedInput.request.headers)),
      query: query,
      body: sanitizeValue(parsedInput.request.body),
      path
    },
    response: {
      ...parsedInput.response,
      headers: toObject(sanitizeValue(parsedInput.response.headers)),
      body: sanitizeValue(parsedInput.response.body)
    },
    webhooks: sanitizeValue(parsedInput.webhooks) as BugSnapshot["webhooks"],
    logs: sanitizeValue(parsedInput.logs) as BugSnapshot["logs"]
  };

  const validated = BugSnapshotSchema.parse(snapshot);
  const target = outputPath ? resolve(outputPath) : resolve("snapshots", `${validated.id}.json`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
  return target;
}

export async function readSnapshot(snapshotPath: string): Promise<BugSnapshot> {
  const content = await readFile(resolve(snapshotPath), "utf-8");
  return BugSnapshotSchema.parse(JSON.parse(content));
}
