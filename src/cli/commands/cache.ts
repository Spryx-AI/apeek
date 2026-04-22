import { existsSync } from "node:fs";
import { Command } from "commander";
import { loadConfig } from "../../config/loader.js";
import {
  cacheDirFor,
  clearAllCache,
  clearCacheEntry,
} from "../../core/cache.js";
import { SourceError } from "../../lib/errors.js";
import { info, warn } from "../output.js";
import type { SourceDescriptor } from "../../types.js";
import type { SourceEntry } from "../../config/schema.js";

function entryToDescriptor(entry: SourceEntry): SourceDescriptor {
  if (entry.url !== undefined) return { kind: "url", url: entry.url };
  if (entry.path !== undefined) return { kind: "path", path: entry.path };
  throw new SourceError("source entry has neither url nor path");
}

export function buildCacheCommand(): Command {
  const cmd = new Command("cache").description("manage apeek cache");
  cmd
    .command("clear")
    .description("clear cache for one or all sources")
    .argument("[alias]", "source alias; omit to clear all")
    .action(async (alias: string | undefined) => {
      if (alias === undefined) {
        await clearAllCache();
        info("cleared all apeek caches");
        return;
      }
      const { config } = loadConfig();
      const entry = config.sources[alias];
      if (entry === undefined) {
        warn(`no source named '${alias}' — nothing to clear`);
        return;
      }
      const descriptor = entryToDescriptor(entry);
      const dir = cacheDirFor(descriptor);
      if (!existsSync(dir)) {
        warn(`source '${alias}' had no cache entry to clear`);
        return;
      }
      await clearCacheEntry(descriptor);
      info(`cleared cache for '${alias}'`);
    });
  return cmd;
}
