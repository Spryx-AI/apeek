import { Command } from "commander";
import { SourceError } from "../../lib/errors.js";
import { info, stdout, warn } from "../output.js";
import {
  addSource,
  entryToDescriptor,
  getSourceEntry,
  listSources,
  removeSource as removeSourceMgr,
  useSource,
} from "../../core/source-manager.js";
import { loadIndexedSpec } from "../../core/query-context.js";

function parseHeaders(raw: string[] | undefined): Record<string, string> | undefined {
  if (raw === undefined || raw.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const entry of raw) {
    const eq = entry.indexOf("=");
    if (eq <= 0) {
      throw new SourceError(`invalid header '${entry}'`, {
        hint: "format: --header 'Name=Value'",
      });
    }
    out[entry.slice(0, eq).trim()] = entry.slice(eq + 1);
  }
  return out;
}

function buildAdd(): Command {
  return new Command("add")
    .description("register a new OpenAPI source")
    .argument("<alias>", "short name for this source")
    .argument("<target>", "URL or filesystem path")
    .option("--header <kv...>", "repeatable 'Name=Value' headers (supports ${VAR} interpolation at fetch time)")
    .option("--ttl <seconds>", "cache TTL in seconds", (v) => Number.parseInt(v, 10))
    .option("--allow-insecure", "permit http:// URLs", false)
    .action((alias: string, target: string, opts: { header?: string[]; ttl?: number; allowInsecure?: boolean }) => {
      const headers = parseHeaders(opts.header);
      addSource({
        alias,
        target,
        ...(headers !== undefined ? { headers } : {}),
        ...(opts.ttl !== undefined ? { cacheTtlSeconds: opts.ttl } : {}),
        ...(opts.allowInsecure === true ? { allowInsecure: true } : {}),
      });
      info(`added source '${alias}'`);
    });
}

function buildList(): Command {
  return new Command("list").description("list configured sources").action(() => {
    const sources = listSources();
    if (sources.length === 0) {
      info("no sources configured — run 'apeek source add' or 'apeek setup'");
      return;
    }
    for (const s of sources) {
      const marker = s.isDefault ? "*" : " ";
      const location = s.url ?? s.path ?? "<invalid>";
      stdout(`${marker} ${s.alias}\t${location}`);
    }
  });
}

function buildUse(): Command {
  return new Command("use")
    .description("set a source as the default")
    .argument("<alias>", "source alias to use by default")
    .action((alias: string) => {
      useSource(alias);
      info(`default source is now '${alias}'`);
    });
}

function buildRemove(): Command {
  return new Command("remove")
    .description("remove a source and its cache")
    .argument("<alias>", "source alias to remove")
    .action(async (alias: string) => {
      await removeSourceMgr(alias);
      info(`removed source '${alias}'`);
    });
}

function buildRefresh(): Command {
  return new Command("refresh")
    .description("re-fetch and re-index one or all sources")
    .argument("[alias]", "source alias; omit to refresh all")
    .action(async (alias: string | undefined) => {
      const targets = alias === undefined ? listSources().map((s) => s.alias) : [alias];
      if (targets.length === 0) {
        info("no sources configured — run 'apeek source add'");
        return;
      }
      for (const a of targets) {
        const entry = getSourceEntry(a);
        const descriptor = entryToDescriptor(entry);
        if (descriptor === undefined) {
          warn(`skipping '${a}': invalid source entry`);
          continue;
        }
        const start = Date.now();
        const { spec } = await loadIndexedSpec(descriptor, { refresh: true });
        const elapsed = Date.now() - start;
        info(
          `refreshed '${a}' in ${elapsed}ms: ${spec.operations.length} operations, ${Object.keys(spec.schemas).length} schemas`,
        );
      }
    });
}

function buildInfo(): Command {
  return new Command("info")
    .description("show metadata about a source (never prints resolved secrets)")
    .argument("<alias>", "source alias")
    .action((alias: string) => {
      const entry = getSourceEntry(alias);
      stdout(`alias:   ${alias}`);
      if (entry.url !== undefined) stdout(`url:     ${entry.url}`);
      if (entry.path !== undefined) stdout(`path:    ${entry.path}`);
      if (entry.allowInsecure === true) stdout(`insecure: true`);
      if (entry.cacheTtlSeconds !== undefined) stdout(`ttl:      ${entry.cacheTtlSeconds}s`);
      if (entry.addedAt !== undefined) stdout(`added:    ${entry.addedAt}`);
      if (entry.headers !== undefined && Object.keys(entry.headers).length > 0) {
        stdout("headers:");
        for (const [name, rawValue] of Object.entries(entry.headers)) {
          stdout(`  ${name}: ${rawValue}`);
        }
      }
    });
}

export function buildSourceCommand(): Command {
  return new Command("source")
    .description("manage OpenAPI sources")
    .addCommand(buildAdd())
    .addCommand(buildList())
    .addCommand(buildUse())
    .addCommand(buildRemove())
    .addCommand(buildRefresh())
    .addCommand(buildInfo());
}
