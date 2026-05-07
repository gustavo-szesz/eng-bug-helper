import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { IssueReportSchema, SlackThreadSchema, type BrowserSnapshot, type BugSnapshot, type GraphqlError, type IssueReport, type SlackThread, type SupportSnapshot } from "./types.js";

function isBugSnapshot(snapshot: SupportSnapshot): snapshot is BugSnapshot {
  return "request" in snapshot && "response" in snapshot;
}

/**
 * Extrai OrgId da URL
 * Exemplo: https://admin.online.engaged.com.br/admin/org/63c022ce0d2d6f000858c442/... -> 63c022ce0d2d6f000858c442
 */
function extractOrgIdFromUrl(url: string): string {
  const match = url.match(/\/org\/([a-f0-9]+)/i);
  return match ? match[1] : "";
}

/**
 * Extrai erros GraphQL do snapshot
 */
function extractGraphqlErrors(snapshot: SupportSnapshot): GraphqlError[] {
  const errors: GraphqlError[] = [];

  if (isBugSnapshot(snapshot)) {
    if (snapshot.response.status >= 400) {
      const isGraphql = /graphql/i.test(snapshot.request.url) ||
        (snapshot.request.body && typeof snapshot.request.body === "object" && ("query" in snapshot.request.body || "operationName" in snapshot.request.body));

      if (isGraphql) {
        const body = snapshot.request.body as Record<string, any>;
        errors.push({
          operationName: body?.operationName,
          query: body?.query,
          variables: body?.variables,
          status: snapshot.response.status,
          statusText: `HTTP ${snapshot.response.status}`,
          durationMs: 0,
          url: snapshot.request.url,
          responsePreview: snapshot.response.body
        });
      }
    }
  } else {
    // Extract GraphQL errors from browser events
    const graphqlErrorEvents = snapshot.events.filter((e) => /graphql.*error|fetch-error.*graphql|xhr-error.*graphql/i.test(e.type));
    for (const event of graphqlErrorEvents) {
      const payload = event.payload as Record<string, any>;
      if (payload?.graphql) {
        errors.push({
          operationName: payload.graphql.operationName,
          query: payload.graphql.queryPreview,
          variables: payload.graphql.variables,
          status: payload.status || 0,
          statusText: payload.statusText || "Unknown",
          durationMs: payload.durationMs || 0,
          url: payload.url || "",
          responsePreview: payload.responsePreview
        });
      }
    }
  }

  return errors;
}

/**
 * Formata erro em descrição humanizada
 */
function humanizeError(snapshot: SupportSnapshot): string {
  if (isBugSnapshot(snapshot)) {
    const method = snapshot.request.method.toUpperCase();
    const path = snapshot.request.path;
    const status = snapshot.response.status;
    const body = snapshot.response.body;

    if (status >= 500) {
      return `A chamada ${method} ${path} retornou erro 500 do servidor. Resposta: ${JSON.stringify(body).slice(0, 200)}`;
    }

    if (status >= 400) {
      return `A chamada ${method} ${path} retornou erro ${status}. Detalhes: ${JSON.stringify(body).slice(0, 200)}`;
    }

    return `A chamada ${method} ${path} completou com status ${status}.`;
  }

  const errorEvents = snapshot.events.filter((e) => /error|rejection/i.test(e.type));
  if (errorEvents.length > 0) {
    const firstError = errorEvents[0];
    return `Detectado erro do tipo "${firstError.type}" na página ${snapshot.context.pathname}. Payload: ${JSON.stringify(firstError.payload).slice(0, 200)}`;
  }

  return `Capturados ${snapshot.eventCount} eventos na página ${snapshot.context.href}.`;
}

/**
 * Constrói thread do Slack pronta para copiar/colar
 */
function buildSlackThreadText(options: {
  title: string;
  orgId: string;
  clientName: string;
  usefulLinks: string[];
  mentions: string[];
  humanDescription: string;
  snapshotId: string;
  graphqlErrors: GraphqlError[];
}): string {
  const lines: string[] = [];

  // Cabeçalho
  lines.push(`*${options.title}*`);
  lines.push("");

  // OrgId e cliente
  if (options.orgId) {
    lines.push(`*OrgId:* ${options.orgId}`);
  }
  if (options.clientName) {
    lines.push(`*Cliente:* ${options.clientName}`);
  }

  // Links úteis
  if (options.usefulLinks.length > 0) {
    lines.push(`*Links úteis:*`);
    for (const link of options.usefulLinks) {
      lines.push(`• ${link}`);
    }
  }

  lines.push("");

  // Menções
  if (options.mentions.length > 0) {
    lines.push(options.mentions.map((m) => `${m}`).join(" "));
  }

  lines.push("");

  // Descrição
  lines.push(options.humanDescription);

  lines.push("");
  lines.push("---");
  lines.push("");

  // GraphQL errors
  if (options.graphqlErrors.length > 0) {
    lines.push("*Erros GraphQL capturados:*");
    lines.push("```json");
    for (const error of options.graphqlErrors) {
      lines.push(`Operation: ${error.operationName || "(anônima)"}`);
      lines.push(`Status: ${error.status}`);
      if (error.query) {
        lines.push(`Query: ${error.query.slice(0, 300)}`);
      }
      lines.push("");
    }
    lines.push("```");
    lines.push("");
  }

  // Snapshot bruto
  lines.push("*Bug report bruto:*");
  lines.push("```");
  lines.push(`Snapshot ID: ${options.snapshotId}`);
  lines.push("```");

  return lines.join("\n");
}

export async function createSlackThread(
  reportJsonPath: string,
  options?: {
    orgId?: string;
    clientName?: string;
    usefulLinks?: string[];
    mentions?: string[];
    humanDescription?: string;
  }
): Promise<{ threadJsonPath: string; threadTextPath: string; thread: SlackThread }> {
  const reportContent = await readFile(resolve(reportJsonPath), "utf-8");
  const report = IssueReportSchema.parse(JSON.parse(reportContent));

  const url = options?.usefulLinks?.[0] || (report.environment as any)?.href || (report.environment as any)?.requestUrl || "";
  const orgId = options?.orgId || extractOrgIdFromUrl(url);

  const graphqlErrors = (report.environment as any)?.graphqlErrors || [];

  const slackThreadText = buildSlackThreadText({
    title: report.title,
    orgId,
    clientName: options?.clientName || "",
    usefulLinks: options?.usefulLinks || [url].filter(Boolean),
    mentions: options?.mentions || [],
    humanDescription: options?.humanDescription || report.summary,
    snapshotId: report.id,
    graphqlErrors
  });

  const thread: SlackThread = {
    title: report.title,
    orgId,
    clientName: options?.clientName || "",
    usefulLinks: options?.usefulLinks || [url].filter(Boolean),
    mentions: options?.mentions || [],
    humanDescription: options?.humanDescription || report.summary,
    snapshotId: report.id,
    graphqlErrors,
    slackThreadText
  };

  const basePath = reportJsonPath.replace(/\.json$/, "");
  const threadJsonPath = `${basePath}.thread.json`;
  const threadTextPath = `${basePath}.thread.txt`;

  await mkdir(dirname(threadJsonPath), { recursive: true });
  await writeFile(threadJsonPath, `${JSON.stringify(SlackThreadSchema.parse(thread), null, 2)}\n`, "utf-8");
  await writeFile(threadTextPath, `${slackThreadText}\n`, "utf-8");

  return { threadJsonPath, threadTextPath, thread };
}
