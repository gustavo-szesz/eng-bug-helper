import { z } from "zod";

const JsonSchema = z.record(z.string(), z.any());

export const BrowserEventSchema = z.object({
  type: z.string().min(1),
  timestamp: z.string().min(1),
  payload: JsonSchema.default({})
});

export const BrowserContextSchema = z.object({
  href: z.string().default(""),
  pathname: z.string().default(""),
  search: z.string().default(""),
  referrer: z.string().default(""),
  title: z.string().default(""),
  userAgent: z.string().default(""),
  language: z.string().default(""),
  platform: z.string().default(""),
  timeZone: z.string().default(""),
  online: z.boolean().default(true),
  cookiesEnabled: z.boolean().default(true),
  visibilityState: z.string().default(""),
  viewport: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative()
  }).default({ width: 0, height: 0 }),
  screen: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative()
  }).default({ width: 0, height: 0 }),
  capturedAt: z.string().min(1)
});

export const BrowserTabSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().default(""),
  url: z.string().default(""),
  favIconUrl: z.string().default("")
});

export const RequestSchema = z.object({
  method: z.string().min(1),
  url: z.string().url(),
  headers: z.record(z.string(), z.any()).default({}),
  query: z.record(z.string(), z.any()).default({}),
  body: z.any().optional()
});
 
export const ResponseSchema = z.object({
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string(), z.any()).default({}),
  body: z.any().optional()
});

export const BugInputSchema = z.object({
  title: z.string().min(1).default("Untitled bug"),
  source: z.string().default("manual"),
  user: z.record(z.string(), z.any()).default({}),
  metadata: z.record(z.string(), z.any()).default({}),
  request: RequestSchema,
  response: ResponseSchema,
  webhooks: z.array(z.record(z.string(), z.any())).default([]),
  logs: z.array(z.record(z.string(), z.any())).default([])
});

export const BugSnapshotSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  title: z.string(),
  source: z.string(),
  user: z.record(z.string(), z.any()),
  metadata: z.record(z.string(), z.any()),
  request: RequestSchema.extend({
    path: z.string()
  }),
  response: ResponseSchema,
  webhooks: z.array(z.record(z.string(), z.any())),
  logs: z.array(z.record(z.string(), z.any()))
});

export const BrowserSnapshotSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  source: z.string().min(1),
  trigger: z.string().min(1),
  tab: BrowserTabSchema,
  context: BrowserContextSchema,
  userAgent: z.string().default(""),
  events: z.array(BrowserEventSchema),
  eventCount: z.number().int().nonnegative(),
  summary: JsonSchema.default({})
});

export const SupportSnapshotSchema = z.union([BugSnapshotSchema, BrowserSnapshotSchema]);

export const IssueDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  environment: JsonSchema.default({}),
  reproductionSteps: z.array(z.string().min(1)),
  expected: z.string().default(""),
  actual: z.string().default(""),
  evidence: JsonSchema.default({}),
  slackMessage: z.string().min(1)
});

export const IssueReportSchema = IssueDraftSchema.extend({
  id: z.string().min(1),
  kind: z.enum(["bug", "browser"]),
  markdown: z.string().min(1)
});

export const GraphqlErrorSchema = z.object({
  operationName: z.string().optional(),
  query: z.string().optional(),
  variables: z.any().optional(),
  status: z.number().int(),
  statusText: z.string(),
  durationMs: z.number().int().nonnegative(),
  url: z.string(),
  responsePreview: z.any().optional()
});

export const SlackThreadSchema = z.object({
  title: z.string().min(1),
  orgId: z.string().default(""),
  clientName: z.string().default(""),
  usefulLinks: z.array(z.string().url()).default([]),
  mentions: z.array(z.string()).default([]),
  humanDescription: z.string().min(1),
  snapshotId: z.string().min(1),
  graphqlErrors: z.array(GraphqlErrorSchema).default([]),
  slackThreadText: z.string().min(1)
});

export type BugInput = z.infer<typeof BugInputSchema>;
export type BugSnapshot = z.infer<typeof BugSnapshotSchema>;
export type BrowserSnapshot = z.infer<typeof BrowserSnapshotSchema>;
export type SupportSnapshot = z.infer<typeof SupportSnapshotSchema>;
export type IssueDraft = z.infer<typeof IssueDraftSchema>;
export type IssueReport = z.infer<typeof IssueReportSchema>;
export type GraphqlError = z.infer<typeof GraphqlErrorSchema>;
export type SlackThread = z.infer<typeof SlackThreadSchema>;
