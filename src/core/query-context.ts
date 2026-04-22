import { logger } from "../lib/logger.js";
import { fetchSpec } from "./fetcher.js";
import { parseSpec } from "./parser.js";
import { buildIndex } from "./indexer.js";
import {
  createMeta,
  isFresh,
  readCacheEntry,
  writeCacheEntry,
} from "./cache.js";
import type {
  ConditionalFetch,
  NormalizedSpec,
  SerializedIndex,
  SourceDescriptor,
} from "../types.js";

export interface LoadedSpec {
  readonly spec: NormalizedSpec;
  readonly index: SerializedIndex;
  readonly fromCache: boolean;
}

export async function loadIndexedSpec(
  source: SourceDescriptor,
  opts: { refresh?: boolean } = {},
): Promise<LoadedSpec> {
  const existing = opts.refresh === true ? undefined : await readCacheEntry(source);

  if (existing !== undefined && isFresh(existing.meta)) {
    logger.debug(`cache hit for ${describe(source)}`);
    return { spec: existing.spec, index: existing.index, fromCache: true };
  }

  const conditional: ConditionalFetch = {};
  if (existing !== undefined && !opts.refresh) {
    Object.assign(
      conditional,
      existing.meta.etag !== undefined ? { etag: existing.meta.etag } : {},
      existing.meta.lastModified !== undefined
        ? { lastModified: existing.meta.lastModified }
        : {},
    );
  }

  const fetched = await fetchSpec(source, conditional);

  if (fetched.kind === "not-modified" && existing !== undefined) {
    logger.debug(`304 Not Modified for ${describe(source)}; refreshing meta in place`);
    const refreshedMeta = createMeta({
      source,
      spec: existing.spec,
      ...(existing.meta.etag !== undefined ? { etag: existing.meta.etag } : {}),
      ...(existing.meta.lastModified !== undefined
        ? { lastModified: existing.meta.lastModified }
        : {}),
    });
    await writeCacheEntry(source, { spec: existing.spec, index: existing.index, meta: refreshedMeta });
    return { spec: existing.spec, index: existing.index, fromCache: true };
  }

  const spec = await parseSpec(fetched.kind === "fresh" ? fetched.data : {});
  const index = buildIndex(spec);
  const meta = createMeta({
    source,
    spec,
    ...(fetched.kind === "fresh" && fetched.etag !== undefined ? { etag: fetched.etag } : {}),
    ...(fetched.kind === "fresh" && fetched.lastModified !== undefined
      ? { lastModified: fetched.lastModified }
      : {}),
  });
  await writeCacheEntry(source, { spec, index, meta });
  return { spec, index, fromCache: false };
}

function describe(source: SourceDescriptor): string {
  return source.kind === "url" ? source.url : source.path;
}
