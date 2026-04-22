import { resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { SourceError } from "../lib/errors.js";
import type { Config, SourceEntry } from "../config/schema.js";
import type { SourceDescriptor } from "../types.js";
import { discoverSpecFile } from "./autodiscovery.js";

export interface ResolvedSource {
  readonly descriptor: SourceDescriptor;
  readonly display: { alias: string | undefined; location: string };
}

function looksLikePath(value: string): boolean {
  if (isAbsolute(value)) return true;
  if (value.startsWith("./") || value.startsWith("../")) return true;
  return /\.(json|ya?ml)$/i.test(value);
}

function entryToDescriptor(entry: SourceEntry): SourceDescriptor {
  if (entry.url !== undefined) {
    const desc: SourceDescriptor = {
      kind: "url",
      url: entry.url,
      ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
      ...(entry.allowInsecure !== undefined ? { allowInsecure: entry.allowInsecure } : {}),
      ...(entry.cacheTtlSeconds !== undefined ? { cacheTtlSeconds: entry.cacheTtlSeconds } : {}),
    };
    return desc;
  }
  if (entry.path !== undefined) {
    return {
      kind: "path",
      path: resolve(entry.path),
      ...(entry.cacheTtlSeconds !== undefined ? { cacheTtlSeconds: entry.cacheTtlSeconds } : {}),
    };
  }
  throw new SourceError("source entry has neither url nor path");
}

function resolveFromFlag(flag: string, cwd: string, config: Config): ResolvedSource {
  if (looksLikePath(flag)) {
    const abs = isAbsolute(flag) ? flag : resolve(cwd, flag);
    if (!existsSync(abs)) {
      throw new SourceError(`source file not found: ${flag}`, {
        hint: "check the path or use 'apeek source list' to see configured sources",
      });
    }
    return { descriptor: { kind: "path", path: abs }, display: { alias: undefined, location: abs } };
  }
  const entry = config.sources[flag];
  if (entry === undefined) {
    const known = Object.keys(config.sources);
    throw new SourceError(`unknown source alias: ${flag}`, {
      hint:
        known.length > 0
          ? `known aliases: ${known.join(", ")}`
          : "no sources configured — run 'apeek source add' or 'apeek setup'",
    });
  }
  return {
    descriptor: entryToDescriptor(entry),
    display: { alias: flag, location: entry.url ?? entry.path ?? "" },
  };
}

function resolveFromDefault(config: Config): ResolvedSource | undefined {
  const alias = config.defaultSource;
  if (alias === undefined) return undefined;
  const entry = config.sources[alias];
  if (entry === undefined) return undefined;
  return {
    descriptor: entryToDescriptor(entry),
    display: { alias, location: entry.url ?? entry.path ?? "" },
  };
}

function resolveFromAutodiscovery(cwd: string): ResolvedSource | undefined {
  const file = discoverSpecFile(cwd);
  if (file === undefined) return undefined;
  return { descriptor: { kind: "path", path: file }, display: { alias: undefined, location: file } };
}

export interface ResolveOptions {
  readonly sourceFlag?: string;
  readonly cwd?: string;
  readonly config: Config;
}

export function resolveSource(opts: ResolveOptions): ResolvedSource {
  const cwd = opts.cwd ?? process.cwd();
  if (opts.sourceFlag !== undefined && opts.sourceFlag !== "") {
    return resolveFromFlag(opts.sourceFlag, cwd, opts.config);
  }
  const fromDefault = resolveFromDefault(opts.config);
  if (fromDefault !== undefined) return fromDefault;
  const fromAuto = resolveFromAutodiscovery(cwd);
  if (fromAuto !== undefined) return fromAuto;
  throw new SourceError("no source configured and no OpenAPI file found", {
    hint:
      "run 'apeek source add <alias> <url-or-path>', 'apeek setup', or pass '--source <path>'",
  });
}
