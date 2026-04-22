import { Command } from "commander";
import { ConfigError } from "../../lib/errors.js";
import { loadConfig, loadGlobalConfigOnly, writeGlobalConfig } from "../../config/loader.js";
import { getGlobalConfigPath } from "../../config/paths.js";
import type { Config } from "../../config/schema.js";
import { stdout } from "../output.js";

const WRITABLE_KEYS: readonly string[] = ["defaultSource", "defaults.format", "defaults.limit"];

function getDotted(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

function coerceForKey(key: string, raw: string): unknown {
  if (key === "defaults.limit") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      throw new ConfigError(`'${key}' must be an integer`);
    }
    return n;
  }
  return raw;
}

function assignDotted(config: Config, key: string, value: unknown): Config {
  if (!WRITABLE_KEYS.includes(key)) {
    throw new ConfigError(`'${key}' is not writable via 'apeek config set'`, {
      hint: `writable keys: ${WRITABLE_KEYS.join(", ")}; use 'apeek source' for sources`,
    });
  }
  const next: Config = { ...config };
  if (key === "defaultSource") {
    next.defaultSource = String(value);
    return next;
  }
  const defaults = { ...(next.defaults ?? {}) } as Record<string, unknown>;
  if (key === "defaults.format") defaults["format"] = value;
  if (key === "defaults.limit") defaults["limit"] = value;
  next.defaults = defaults as Config["defaults"];
  return next;
}

export function buildConfigCommand(): Command {
  const cmd = new Command("config").description("read and write apeek configuration");

  cmd
    .command("get")
    .description("read a config value (dotted path)")
    .argument("<key>", "dotted key, e.g. 'defaultSource' or 'defaults.limit'")
    .action((key: string) => {
      const { config } = loadConfig();
      const value = getDotted(config, key);
      if (value === undefined) {
        process.exit(1);
      }
      stdout(typeof value === "string" ? value : JSON.stringify(value));
    });

  cmd
    .command("set")
    .description("write a config value (dotted path); rejects schema violations without mutating disk")
    .argument("<key>", "dotted key")
    .argument("<value>", "value")
    .action((key: string, raw: string) => {
      const config = loadGlobalConfigOnly();
      const next = assignDotted(config, key, coerceForKey(key, raw));
      writeGlobalConfig(next);
    });

  cmd
    .command("path")
    .description("print the absolute path to the global config file")
    .action(() => {
      stdout(getGlobalConfigPath());
    });

  return cmd;
}
