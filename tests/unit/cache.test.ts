import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CACHE_SCHEMA_VERSION,
  cacheDirFor,
  canonicalizeSource,
  clearAllCache,
  clearCacheEntry,
  createMeta,
  defaultTtlFor,
  isFresh,
  readCacheEntry,
  sourceHash,
  writeCacheEntry,
} from "../../src/core/cache.js";
import type { NormalizedSpec, SerializedIndex, SourceDescriptor } from "../../src/types.js";

const urlSource: SourceDescriptor = { kind: "url", url: "https://api.example.com/openapi.json" };
const pathSource: SourceDescriptor = { kind: "path", path: "/tmp/openapi.json" };

function makeSpec(): NormalizedSpec {
  return {
    openapi: "3.0.0",
    operations: [],
    schemas: {},
    tags: {},
  };
}

function makeIndex(): SerializedIndex {
  return { operations: "{}", schemas: "{}" };
}

describe("cache canonicalization", () => {
  it("normalizes URL scheme and host to lowercase and strips fragment", () => {
    expect(canonicalizeSource({ kind: "url", url: "HTTPS://API.Example.com/openapi.json#frag" }))
      .toBe("url:https://api.example.com/openapi.json");
  });

  it("sorts query parameters to stabilize the canonical form", () => {
    const a = canonicalizeSource({ kind: "url", url: "https://x.test/o.json?b=2&a=1" });
    const b = canonicalizeSource({ kind: "url", url: "https://x.test/o.json?a=1&b=2" });
    expect(a).toBe(b);
  });

  it("resolves path sources to absolute paths", () => {
    const rel = canonicalizeSource({ kind: "path", path: "./openapi.json" });
    expect(rel.startsWith("path:/")).toBe(true);
  });

  it("produces a 16-char hex source hash", () => {
    const h = sourceHash(urlSource);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces distinct hashes for URL vs path with same content", () => {
    expect(sourceHash(urlSource)).not.toBe(sourceHash(pathSource));
  });
});

describe("cache freshness", () => {
  it("considers a remote-source entry fresh within TTL", () => {
    const meta = createMeta({ source: urlSource, spec: makeSpec() });
    expect(isFresh(meta)).toBe(true);
  });

  it("considers a remote-source entry stale after TTL", () => {
    const meta = createMeta({ source: urlSource, spec: makeSpec() });
    const staleNow = meta.fetchedAt + (meta.ttlSeconds ?? 0) * 1000 + 1;
    expect(isFresh(meta, staleNow)).toBe(false);
  });

  it("considers a local-source entry fresh regardless of age", () => {
    const meta = createMeta({ source: pathSource, spec: makeSpec() });
    expect(meta.ttlSeconds).toBeNull();
    expect(isFresh(meta, meta.fetchedAt + 1e12)).toBe(true);
  });

  it("invalidates entries with mismatched cache schema version", () => {
    const meta = { ...createMeta({ source: urlSource, spec: makeSpec() }), cacheSchemaVersion: 999 };
    expect(isFresh(meta)).toBe(false);
  });

  it("invalidates entries with mismatched Node major version", () => {
    const meta = { ...createMeta({ source: urlSource, spec: makeSpec() }), nodeMajor: 0 };
    expect(isFresh(meta)).toBe(false);
  });

  it("defaultTtlFor returns 3600 for remote and null for local", () => {
    expect(defaultTtlFor(urlSource)).toBe(3600);
    expect(defaultTtlFor(pathSource)).toBeNull();
  });

  it("defaultTtlFor honors explicit cacheTtlSeconds override", () => {
    expect(defaultTtlFor({ ...urlSource, cacheTtlSeconds: 60 })).toBe(60);
  });
});

describe("cache read/write roundtrip", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "apeek-cache-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns undefined when no entry exists", async () => {
    expect(await readCacheEntry(urlSource, root)).toBeUndefined();
  });

  it("writes and reads back a cache entry", async () => {
    const spec = makeSpec();
    const index = makeIndex();
    const meta = createMeta({ source: urlSource, spec, etag: "abc", lastModified: "yesterday" });
    await writeCacheEntry(urlSource, { spec, index, meta }, root);

    const entry = await readCacheEntry(urlSource, root);
    expect(entry).toBeDefined();
    expect(entry?.meta.etag).toBe("abc");
    expect(entry?.meta.lastModified).toBe("yesterday");
    expect(entry?.meta.cacheSchemaVersion).toBe(CACHE_SCHEMA_VERSION);
    expect(entry?.spec.openapi).toBe("3.0.0");
  });

  it("writes files with mode 0600 on POSIX", async () => {
    if (process.platform === "win32") return;
    const spec = makeSpec();
    const index = makeIndex();
    const meta = createMeta({ source: urlSource, spec });
    await writeCacheEntry(urlSource, { spec, index, meta }, root);
    const dir = cacheDirFor(urlSource, root);
    const mode = statSync(join(dir, "spec.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("treats corrupt cache as a miss (no throw)", async () => {
    const dir = cacheDirFor(urlSource, root);
    rmSync(dir, { recursive: true, force: true });
    // Set up a corrupt dir: spec.json present but invalid JSON, others missing
    const spec = makeSpec();
    const index = makeIndex();
    const meta = createMeta({ source: urlSource, spec });
    await writeCacheEntry(urlSource, { spec, index, meta }, root);
    writeFileSync(join(dir, "spec.json"), "{ not json");
    const entry = await readCacheEntry(urlSource, root);
    expect(entry).toBeUndefined();
  });

  it("clearCacheEntry removes the entry directory", async () => {
    const spec = makeSpec();
    const index = makeIndex();
    const meta = createMeta({ source: urlSource, spec });
    await writeCacheEntry(urlSource, { spec, index, meta }, root);
    await clearCacheEntry(urlSource, root);
    expect(await readCacheEntry(urlSource, root)).toBeUndefined();
  });

  it("clearAllCache removes every entry", async () => {
    const spec = makeSpec();
    const index = makeIndex();
    await writeCacheEntry(
      urlSource,
      { spec, index, meta: createMeta({ source: urlSource, spec }) },
      root,
    );
    await writeCacheEntry(
      pathSource,
      { spec, index, meta: createMeta({ source: pathSource, spec }) },
      root,
    );
    await clearAllCache(root);
    expect(await readCacheEntry(urlSource, root)).toBeUndefined();
    expect(await readCacheEntry(pathSource, root)).toBeUndefined();
  });
});
