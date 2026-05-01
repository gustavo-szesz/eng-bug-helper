import { z } from "zod";

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

export type BugInput = z.infer<typeof BugInputSchema>;
export type BugSnapshot = z.infer<typeof BugSnapshotSchema>;
