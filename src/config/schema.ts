import { z } from "zod";

export const CONFIG_SCHEMA_VERSION = 1;

const headerValueSchema = z.string();

const sourceEntrySchema = z
  .object({
    url: z.string().optional(),
    path: z.string().optional(),
    headers: z.record(z.string(), headerValueSchema).optional(),
    cacheTtlSeconds: z.number().int().nonnegative().optional(),
    allowInsecure: z.boolean().optional(),
    addedAt: z.string().optional(),
  })
  .refine((v) => Boolean(v.url) !== Boolean(v.path), {
    message: "source must have exactly one of 'url' or 'path'",
  });

export const defaultsSchema = z.object({
  format: z.enum(["markdown", "json", "compact"]).optional(),
  limit: z.number().int().positive().optional(),
});

export const configSchema = z.object({
  version: z.literal(CONFIG_SCHEMA_VERSION),
  defaultSource: z.string().optional(),
  sources: z.record(z.string(), sourceEntrySchema).default({}),
  defaults: defaultsSchema.optional(),
});

export type SourceEntry = z.infer<typeof sourceEntrySchema>;
export type Config = z.infer<typeof configSchema>;
export type Defaults = z.infer<typeof defaultsSchema>;

export function emptyConfig(): Config {
  return { version: CONFIG_SCHEMA_VERSION, sources: {} };
}
