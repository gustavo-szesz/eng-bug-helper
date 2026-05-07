import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import {
  BrowserSnapshotSchema,
  BugSnapshotSchema,
  IssueReportSchema,
  type BrowserSnapshot,
  type BugSnapshot,
  type IssueReport,
  type SupportSnapshot
} from "./types.js";

function isBugSnapshot(snapshot: SupportSnapshot): snapshot is BugSnapshot {
  return "request" in snapshot && "response" in snapshot;
}

function safeJson(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "incident";
}

function requestPreview(incident: BugSnapshot): string {
  const queryText = Object.entries(incident.request.query)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return queryText ? `${incident.request.method.toUpperCase()} ${incident.request.path}?${queryText}` : `${incident.request.method.toUpperCase()} ${incident.request.path}`;
}

function detectSeverity(snapshot: SupportSnapshot): IssueReport["severity"] {
  if (isBugSnapshot(snapshot)) {
    if (snapshot.response.status >= 500) {
      return "critical";
    }
    if (snapshot.response.status >= 400) {
      return "high";
    }
    return "medium";
  }

  const errorEvents = snapshot.events.filter((event) => /error|rejection/i.test(event.type));
  if (errorEvents.length > 0) {
    return "high";
  }
  if (snapshot.eventCount > 0) {
    return "medium";
  }
  return "low";
}

function buildSlackMessage(report: Omit<IssueReport, "slackMessage" | "markdown">): string {
  const lines = [
    `[${report.severity.toUpperCase()}] ${report.title}`,
    report.summary,
    `Snapshot: ${report.id}`,
    `Tipo: ${report.kind}`
  ];
  return lines.join("\n");
}

function buildBugReport(snapshot: BugSnapshot): Omit<IssueReport, "slackMessage" | "markdown"> & { markdown: string } {
  const sections = [
    {
      title: "Resumo",
      body: [
        `Fonte: ${snapshot.source}`,
        `Entrada: ${snapshot.title}`,
        `Requisição: ${requestPreview(snapshot)}`,
        `Resposta: HTTP ${snapshot.response.status}`
      ]
    },
    {
      title: "Request",
      body: [
        `URL: ${snapshot.request.url}`,
        `Headers: ${safeJson(snapshot.request.headers)}`,
        `Body: ${safeJson(snapshot.request.body) || "<vazio>"}`
      ]
    },
    {
      title: "Response",
      body: [
        `Status: ${snapshot.response.status}`,
        `Headers: ${safeJson(snapshot.response.headers)}`,
        `Body: ${safeJson(snapshot.response.body) || "<vazio>"}`
      ]
    },
    {
      title: "Sinais de suporte",
      body: [
        `Logs capturados: ${snapshot.logs.length}`,
        `Webhooks capturados: ${snapshot.webhooks.length}`,
        `Query params: ${Object.keys(snapshot.request.query).length}`
      ]
    },
    {
      title: "Reprodução",
      body: [
        `1. npm run replay:serve -- --snapshot snapshots/${snapshot.id}.json`,
        `2. npm run replay:run -- --snapshot snapshots/${snapshot.id}.json --base-url http://localhost:4010`,
        "3. Compare o retorno do sandbox com a falha original."
      ]
    }
  ];

  const summary = `${snapshot.request.method.toUpperCase()} ${snapshot.request.path} retornou HTTP ${snapshot.response.status}.`;
  const title = snapshot.title;
  const severity = detectSeverity(snapshot);
  const environment = {
    source: snapshot.source,
    requestMethod: snapshot.request.method,
    requestPath: snapshot.request.path,
    requestUrl: snapshot.request.url,
    responseStatus: snapshot.response.status,
    metadata: snapshot.metadata,
    user: snapshot.user
  };

  const issue = {
    id: snapshot.id,
    kind: "bug" as const,
    title,
    summary,
    severity,
    environment,
    reproductionSteps: sections[4].body,
    expected: "A chamada deveria concluir sem erro ou retornar um status compatível com o fluxo esperado.",
    actual: `Resposta HTTP ${snapshot.response.status} com body ${truncate(safeJson(snapshot.response.body), 1000)}`,
    evidence: {
      request: snapshot.request,
      response: snapshot.response,
      logs: snapshot.logs,
      webhooks: snapshot.webhooks,
      sections
    },
    slackMessage: ""
  };

  const slackMessage = buildSlackMessage(issue);
  const markdown = [
    `# ${issue.title}`,
    "",
    `- Snapshot: ${issue.id}`,
    `- Kind: ${issue.kind}`,
    `- Severity: ${issue.severity}`,
    "",
    issue.summary,
    "",
    ...sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.body,
      ""
    ]),
    "## Slack draft",
    "",
    "```text",
    slackMessage,
    "```",
    ""
  ].join("\n");

  return IssueReportSchema.parse({
    ...issue,
    slackMessage,
    markdown
  });
}

function buildBrowserReport(snapshot: BrowserSnapshot): Omit<IssueReport, "slackMessage" | "markdown"> & { markdown: string } {
  const errorEvents = snapshot.events.filter((event) => /error|rejection/i.test(event.type)).slice(-8);
  const networkEvents = snapshot.events.filter((event) => /fetch|xhr|graphql|network/i.test(event.type)).slice(-8);

  const sections = [
    {
      title: "Resumo",
      body: [
        `Fonte: ${snapshot.source}`,
        `Disparo: ${snapshot.trigger}`,
        `Página: ${snapshot.context.title || snapshot.context.href}`,
        `Eventos capturados: ${snapshot.eventCount}`
      ]
    },
    {
      title: "Contexto do browser",
      body: [
        `URL: ${snapshot.context.href}`,
        `Referrer: ${snapshot.context.referrer || "<vazio>"}`,
        `Viewport: ${snapshot.context.viewport.width}x${snapshot.context.viewport.height}`,
        `Screen: ${snapshot.context.screen.width}x${snapshot.context.screen.height}`,
        `Timezone: ${snapshot.context.timeZone}`,
        `Online: ${snapshot.context.online ? "sim" : "não"}`,
        `Cookies: ${snapshot.context.cookiesEnabled ? "sim" : "não"}`
      ]
    },
    {
      title: "Eventos de erro",
      body: errorEvents.length > 0
        ? errorEvents.map((event) => `- ${event.type}: ${truncate(safeJson(event.payload), 320)}`)
        : ["- Nenhum evento de erro capturado."]
    },
    {
      title: "Eventos de rede",
      body: networkEvents.length > 0
        ? networkEvents.map((event) => `- ${event.type}: ${truncate(safeJson(event.payload), 320)}`)
        : ["- Nenhum evento de rede capturado."]
    }
  ];

  const summary = `${snapshot.trigger} em ${snapshot.context.pathname || snapshot.context.href} gerou ${snapshot.eventCount} evento(s) capturados.`;
  const title = snapshot.context.title || snapshot.context.pathname || "Browser incident";
  const severity = detectSeverity(snapshot);
  const environment = {
    source: snapshot.source,
    href: snapshot.context.href,
    pathname: snapshot.context.pathname,
    userAgent: snapshot.userAgent,
    tab: snapshot.tab,
    context: snapshot.context
  };

  const issue = {
    id: snapshot.id,
    kind: "browser" as const,
    title,
    summary,
    severity,
    environment,
    reproductionSteps: [
      `1. Reproduzir o fluxo na página ${snapshot.context.pathname || snapshot.context.href}.`,
      `2. Reproduzir o gatilho ${snapshot.trigger}.`,
      "3. Validar os eventos e requests observados no snapshot."
    ],
    expected: "A interação deveria concluir sem erro visível no browser.",
    actual: `Foram capturados ${snapshot.eventCount} evento(s), incluindo ${errorEvents.length} erro(s).`,
    evidence: {
      tab: snapshot.tab,
      context: snapshot.context,
      events: snapshot.events,
      sections
    },
    slackMessage: ""
  };

  const slackMessage = buildSlackMessage(issue);
  const markdown = [
    `# ${issue.title}`,
    "",
    `- Snapshot: ${issue.id}`,
    `- Kind: ${issue.kind}`,
    `- Severity: ${issue.severity}`,
    "",
    issue.summary,
    "",
    ...sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.body,
      ""
    ]),
    "## Slack draft",
    "",
    "```text",
    slackMessage,
    "```",
    ""
  ].join("\n");

  return IssueReportSchema.parse({
    ...issue,
    slackMessage,
    markdown
  });
}

export async function readSupportSnapshot(snapshotPath: string): Promise<SupportSnapshot> {
  const content = await readFile(resolve(snapshotPath), "utf-8");
  const raw = JSON.parse(content) as unknown;

  const bugResult = BugSnapshotSchema.safeParse(raw);
  if (bugResult.success) {
    return bugResult.data;
  }

  const browserResult = BrowserSnapshotSchema.safeParse(raw);
  if (browserResult.success) {
    return browserResult.data;
  }

  throw new Error("Arquivo não corresponde a um snapshot bugtool ou browser snapshot válido");
}

export async function createIssueReport(snapshotPath: string, outputPath?: string): Promise<{ markdownPath: string; jsonPath: string }> {
  const snapshot = await readSupportSnapshot(snapshotPath);
  const report = isBugSnapshot(snapshot) ? buildBugReport(snapshot) : buildBrowserReport(snapshot);

  const baseDir = outputPath
    ? (extname(outputPath) === ".md" || extname(outputPath) === ".json" ? dirname(outputPath) : outputPath)
    : resolve("reports");
  const baseName = outputPath && (extname(outputPath) === ".md" || extname(outputPath) === ".json")
    ? outputPath.replace(/\.(md|json)$/i, "")
    : resolve(baseDir, `${report.id}-${slugify(report.title)}`);
  const markdownPath = `${baseName}.md`;
  const jsonPath = `${baseName}.json`;

  await mkdir(dirname(markdownPath), { recursive: true });
  await writeFile(markdownPath, `${report.markdown}\n`, "utf-8");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  return { markdownPath, jsonPath };
}