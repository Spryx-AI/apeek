import { loadConfig } from "../config/loader.js";
import { resolveSource, type ResolvedSource } from "../core/source-resolver.js";
import { loadIndexedSpec, type LoadedSpec } from "../core/query-context.js";

export interface QueryInvocation {
  readonly resolved: ResolvedSource;
  readonly loaded: LoadedSpec;
}

export interface GlobalFlags {
  readonly source?: string;
  readonly format?: string;
  readonly limit?: number;
  readonly refresh?: boolean;
}

export async function prepareQuery(flags: GlobalFlags): Promise<QueryInvocation> {
  const { config } = loadConfig();
  const resolved = resolveSource({
    ...(flags.source !== undefined ? { sourceFlag: flags.source } : {}),
    config,
  });
  const loaded = await loadIndexedSpec(resolved.descriptor, {
    refresh: flags.refresh === true,
  });
  return { resolved, loaded };
}

export function effectiveFormat(flag: string | undefined): string {
  const { config } = loadConfig();
  return flag ?? config.defaults?.format ?? "markdown";
}

export function effectiveLimit(flag: number | undefined): number {
  const { config } = loadConfig();
  return flag ?? config.defaults?.limit ?? 5;
}
