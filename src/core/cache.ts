import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CacheError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { getCacheRoot } from "../config/paths.js";
import type { CacheMeta, NormalizedSpec, SerializedIndex, SourceDescriptor } from "../types.js";

export const CACHE_SCHEMA_VERSION = 1;
const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
const DEFAULT_REMOTE_TTL_SECONDS = 3600;

export function canonicalizeSource(source: SourceDescriptor): string {
  if (source.kind === "path") {
    return `path:${resolve(source.path)}`;
  }
  return `url:${normalizeUrl(source.url)}`;
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    u.search = "";
    for (const [k, v] of params) u.searchParams.append(k, v);
    return u.toString();
  } catch {
    return raw;
  }
}

export function sourceHash(source: SourceDescriptor): string {
  return createHash("sha256").update(canonicalizeSource(source)).digest("hex").slice(0, 16);
}

export interface CacheEntry {
  readonly spec: NormalizedSpec;
  readonly index: SerializedIndex;
  readonly meta: CacheMeta;
}

export function cacheDirFor(source: SourceDescriptor, root: string = getCacheRoot()): string {
  return join(root, sourceHash(source));
}

export function defaultTtlFor(source: SourceDescriptor): number | null {
  if (source.cacheTtlSeconds !== undefined) return source.cacheTtlSeconds;
  if (source.kind === "path") return null;
  return DEFAULT_REMOTE_TTL_SECONDS;
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  if (process.platform !== "win32") {
    await chmod(path, 0o700).catch(() => undefined);
  }
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, { mode: 0o600 });
  await rename(tmp, path);
}

function specHash(spec: NormalizedSpec): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 16);
}

export function createMeta(opts: {
  source: SourceDescriptor;
  spec: NormalizedSpec;
  etag?: string;
  lastModified?: string;
}): CacheMeta {
  const ttl = defaultTtlFor(opts.source);
  return {
    fetchedAt: Date.now(),
    ttlSeconds: ttl,
    specHash: specHash(opts.spec),
    cacheSchemaVersion: CACHE_SCHEMA_VERSION,
    nodeMajor: NODE_MAJOR,
    ...(opts.etag !== undefined ? { etag: opts.etag } : {}),
    ...(opts.lastModified !== undefined ? { lastModified: opts.lastModified } : {}),
  };
}

export async function readCacheEntry(
  source: SourceDescriptor,
  root: string = getCacheRoot(),
): Promise<CacheEntry | undefined> {
  const dir = cacheDirFor(source, root);
  if (!existsSync(dir)) return undefined;
  try {
    const [metaRaw, specRaw, indexRaw] = await Promise.all([
      readFile(join(dir, "meta.json"), "utf8"),
      readFile(join(dir, "spec.json"), "utf8"),
      readFile(join(dir, "index.json"), "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as CacheMeta;
    const spec = JSON.parse(specRaw) as NormalizedSpec;
    const index = JSON.parse(indexRaw) as SerializedIndex;
    if (
      meta.cacheSchemaVersion !== CACHE_SCHEMA_VERSION ||
      meta.nodeMajor !== NODE_MAJOR ||
      typeof spec !== "object" ||
      spec === null
    ) {
      logger.debug(`cache invalidated for ${dir}: schema/node mismatch`);
      return undefined;
    }
    return { meta, spec, index };
  } catch (err) {
    logger.debug(
      `cache read failed for ${dir} — treating as miss: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

export async function writeCacheEntry(
  source: SourceDescriptor,
  entry: CacheEntry,
  root: string = getCacheRoot(),
): Promise<void> {
  const dir = cacheDirFor(source, root);
  try {
    await ensureDir(dir);
    await writeAtomic(join(dir, "spec.json"), JSON.stringify(entry.spec));
    await writeAtomic(join(dir, "index.json"), JSON.stringify(entry.index));
    await writeAtomic(join(dir, "meta.json"), JSON.stringify(entry.meta));
  } catch (err) {
    throw new CacheError(`failed to write cache for source hash ${sourceHash(source)}`, {
      hint: `check permissions on ${dir}`,
      cause: err,
    });
  }
}

export function isFresh(meta: CacheMeta, now: number = Date.now()): boolean {
  if (meta.cacheSchemaVersion !== CACHE_SCHEMA_VERSION) return false;
  if (meta.nodeMajor !== NODE_MAJOR) return false;
  if (meta.ttlSeconds === null) return true;
  return now < meta.fetchedAt + meta.ttlSeconds * 1000;
}

export async function clearCacheEntry(
  source: SourceDescriptor,
  root: string = getCacheRoot(),
): Promise<void> {
  const dir = cacheDirFor(source, root);
  await rm(dir, { recursive: true, force: true });
}

export async function clearAllCache(root: string = getCacheRoot()): Promise<void> {
  await rm(root, { recursive: true, force: true });
}
