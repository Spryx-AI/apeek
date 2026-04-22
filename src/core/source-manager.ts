import { resolve } from "node:path";
import { SourceError } from "../lib/errors.js";
import { loadGlobalConfigOnly, writeGlobalConfig } from "../config/loader.js";
import type { Config, SourceEntry } from "../config/schema.js";
import type { SourceDescriptor } from "../types.js";
import { clearCacheEntry } from "./cache.js";

export interface AddSourceOptions {
  readonly alias: string;
  readonly target: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly cacheTtlSeconds?: number;
  readonly allowInsecure?: boolean;
}

export interface SourceListEntry {
  readonly alias: string;
  readonly url?: string;
  readonly path?: string;
  readonly isDefault: boolean;
  readonly cacheTtlSeconds?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly allowInsecure?: boolean;
  readonly addedAt?: string;
}

function isUrlTarget(target: string): boolean {
  return target.startsWith("http://") || target.startsWith("https://");
}

function buildEntry(opts: AddSourceOptions): SourceEntry {
  const common = {
    ...(opts.headers !== undefined ? { headers: opts.headers } : {}),
    ...(opts.cacheTtlSeconds !== undefined ? { cacheTtlSeconds: opts.cacheTtlSeconds } : {}),
    addedAt: new Date().toISOString(),
  };
  if (isUrlTarget(opts.target)) {
    if (opts.target.startsWith("http://") && opts.allowInsecure !== true) {
      throw new SourceError(`refusing to register plain HTTP source: ${opts.target}`, {
        hint: "use HTTPS or pass --allow-insecure",
      });
    }
    return {
      url: opts.target,
      ...common,
      ...(opts.target.startsWith("http://") ? { allowInsecure: true } : {}),
    };
  }
  return {
    path: resolve(opts.target),
    ...common,
  };
}

export function addSource(opts: AddSourceOptions): Config {
  const config = loadGlobalConfigOnly();
  if (config.sources[opts.alias] !== undefined) {
    throw new SourceError(`source alias '${opts.alias}' already exists`, {
      hint: `remove it with 'apeek source remove ${opts.alias}' or pick a different alias`,
    });
  }
  const entry = buildEntry(opts);
  const next: Config = {
    ...config,
    sources: { ...config.sources, [opts.alias]: entry },
  };
  if (next.defaultSource === undefined) {
    next.defaultSource = opts.alias;
  }
  writeGlobalConfig(next);
  return next;
}

export function listSources(): SourceListEntry[] {
  const config = loadGlobalConfigOnly();
  const defaultAlias = config.defaultSource;
  return Object.entries(config.sources)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([alias, entry]) => ({
      alias,
      isDefault: alias === defaultAlias,
      ...(entry.url !== undefined ? { url: entry.url } : {}),
      ...(entry.path !== undefined ? { path: entry.path } : {}),
      ...(entry.cacheTtlSeconds !== undefined
        ? { cacheTtlSeconds: entry.cacheTtlSeconds }
        : {}),
      ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
      ...(entry.allowInsecure !== undefined ? { allowInsecure: entry.allowInsecure } : {}),
      ...(entry.addedAt !== undefined ? { addedAt: entry.addedAt } : {}),
    }));
}

export function useSource(alias: string): void {
  const config = loadGlobalConfigOnly();
  if (config.sources[alias] === undefined) {
    const known = Object.keys(config.sources);
    throw new SourceError(`unknown source alias: ${alias}`, {
      hint:
        known.length > 0 ? `known aliases: ${known.join(", ")}` : "no sources configured",
    });
  }
  writeGlobalConfig({ ...config, defaultSource: alias });
}

export async function removeSource(alias: string): Promise<void> {
  const config = loadGlobalConfigOnly();
  const entry = config.sources[alias];
  if (entry === undefined) {
    throw new SourceError(`unknown source alias: ${alias}`);
  }
  const { [alias]: _removed, ...remainingSources } = config.sources;
  const next: Config = {
    ...config,
    sources: remainingSources,
  };
  if (config.defaultSource === alias) {
    delete next.defaultSource;
  }
  writeGlobalConfig(next);
  const descriptor = entryToDescriptor(entry);
  if (descriptor !== undefined) {
    await clearCacheEntry(descriptor);
  }
}

export function getSourceEntry(alias: string): SourceEntry {
  const config = loadGlobalConfigOnly();
  const entry = config.sources[alias];
  if (entry === undefined) {
    const known = Object.keys(config.sources);
    throw new SourceError(`unknown source alias: ${alias}`, {
      hint:
        known.length > 0 ? `known aliases: ${known.join(", ")}` : "no sources configured",
    });
  }
  return entry;
}

export function getConfiguredAliases(): string[] {
  return Object.keys(loadGlobalConfigOnly().sources);
}

export function entryToDescriptor(entry: SourceEntry): SourceDescriptor | undefined {
  if (entry.url !== undefined) {
    return {
      kind: "url",
      url: entry.url,
      ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
      ...(entry.allowInsecure !== undefined ? { allowInsecure: entry.allowInsecure } : {}),
      ...(entry.cacheTtlSeconds !== undefined ? { cacheTtlSeconds: entry.cacheTtlSeconds } : {}),
    };
  }
  if (entry.path !== undefined) {
    return {
      kind: "path",
      path: entry.path,
      ...(entry.cacheTtlSeconds !== undefined ? { cacheTtlSeconds: entry.cacheTtlSeconds } : {}),
    };
  }
  return undefined;
}
