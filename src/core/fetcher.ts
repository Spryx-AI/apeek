import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import yaml from "js-yaml";
import { FetchError } from "../lib/errors.js";
import { interpolateHeaders } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { redactHeaders } from "../lib/redact.js";
import type { ConditionalFetch, FetchResult, SourceDescriptor } from "../types.js";

const SUPPORTED_EXTENSIONS = [".json", ".yaml", ".yml"] as const;
const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

function parseSpecBytes(raw: string, contentType: string | undefined, hint: string): unknown {
  const lowered = contentType?.toLowerCase() ?? "";
  const looksYaml =
    lowered.includes("yaml") ||
    YAML_EXTENSIONS.has(extname(hint).toLowerCase());
  try {
    if (looksYaml) return yaml.load(raw);
    return JSON.parse(raw);
  } catch (err) {
    throw new FetchError(`failed to parse spec body from ${hint}`, {
      hint: looksYaml
        ? "the response did not parse as YAML — verify the source returns a valid spec"
        : "the response did not parse as JSON — verify the source returns a valid spec",
      cause: err,
    });
  }
}

export async function fetchSpec(
  source: SourceDescriptor,
  conditional?: ConditionalFetch,
): Promise<FetchResult> {
  if (source.kind === "path") return fetchLocal(source.path);
  return fetchRemote(source, conditional);
}

async function fetchLocal(path: string): Promise<FetchResult> {
  const ext = extname(path).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new FetchError(`unsupported file extension for spec: '${ext}'`, {
      hint: `use one of ${SUPPORTED_EXTENSIONS.join(", ")}`,
    });
  }
  if (!existsSync(path)) {
    throw new FetchError(`spec file not found: ${path}`, {
      hint: "check the path or use 'apeek source list' to see configured sources",
    });
  }
  const raw = await readFile(path, "utf8");
  const data = parseSpecBytes(raw, undefined, path);
  return { kind: "fresh", data };
}

async function fetchRemote(
  source: { url: string; headers?: Readonly<Record<string, string>>; allowInsecure?: boolean },
  conditional?: ConditionalFetch,
): Promise<FetchResult> {
  const url = source.url;
  if (!url.startsWith("https://") && source.allowInsecure !== true) {
    throw new FetchError(`refusing to fetch over plain HTTP: ${url}`, {
      hint: "use HTTPS, or re-add the source with --allow-insecure if you must",
    });
  }

  const baseHeaders: Record<string, string> = {
    Accept: "application/json, application/yaml;q=0.9, */*;q=0.5",
    "User-Agent": "apeek/0.1 (+https://github.com/spryx-ai/apeek)",
  };

  const interpolated = interpolateHeaders(source.headers ?? {});
  const headers: Record<string, string> = { ...baseHeaders, ...interpolated };
  if (conditional?.etag !== undefined) headers["If-None-Match"] = conditional.etag;
  if (conditional?.lastModified !== undefined) {
    headers["If-Modified-Since"] = conditional.lastModified;
  }

  logger.debugHeaders(`fetch ${url}`, headers);

  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, redirect: "follow" });
  } catch (err) {
    throw new FetchError(`network error fetching ${url}`, {
      hint: "check connectivity and the source URL",
      cause: err,
    });
  }

  if (res.status === 304) {
    logger.debug(`fetch ${url}: 304 Not Modified`);
    return { kind: "not-modified" };
  }

  if (!res.ok) {
    logger.debugHeaders(`response headers (redacted)`, redactHeaders(headersToObject(res.headers)));
    const authHint =
      res.status === 401 || res.status === 403
        ? "verify your authentication header — use 'apeek source info <alias>' to inspect"
        : undefined;
    throw new FetchError(
      `HTTP ${res.status} ${res.statusText} from ${url}`,
      authHint !== undefined ? { hint: authHint } : {},
    );
  }

  const bodyText = await res.text();
  const contentType = res.headers.get("content-type") ?? undefined;
  const data = parseSpecBytes(bodyText, contentType, url);

  const result: FetchResult = {
    kind: "fresh",
    data,
  };
  const etag = res.headers.get("etag");
  const lastModified = res.headers.get("last-modified");
  if (etag !== null || lastModified !== null) {
    return {
      kind: "fresh",
      data,
      ...(etag !== null ? { etag } : {}),
      ...(lastModified !== null ? { lastModified } : {}),
    };
  }
  return result;
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, name) => {
    out[name] = value;
  });
  return out;
}
