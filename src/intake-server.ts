import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BrowserSnapshotSchema } from "./types.js";

const PORT = Number(process.env.PORT || "4020");

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
} 

createServer(async (req, res) => {
  try {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== "POST" || req.url !== "/internal/auto-snapshot") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const raw = await readBody(req);
    const payload = JSON.parse(raw) as unknown;
    const parsed = BrowserSnapshotSchema.safeParse(payload);
    if (!parsed.success) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Invalid browser snapshot payload", details: parsed.error.flatten() }));
      return;
    }

    const id = parsed.data.id || `bug-${Date.now()}`;

    const dir = resolve("snapshots", "remote");
    await mkdir(dir, { recursive: true });
    const filePath = resolve(dir, `${id}.json`);
    await writeFile(filePath, `${JSON.stringify({ ...parsed.data, receivedAt: new Date().toISOString() }, null, 2)}\n`, "utf-8");

    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, bugId: id, storedAt: filePath }));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(error) }));
  }
}).listen(PORT, () => {
  process.stdout.write(`Snapshot intake server listening on http://localhost:${PORT}\n`);
  process.stdout.write(`POST endpoint: http://localhost:${PORT}/internal/auto-snapshot\n`);
});
