import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ConfigError } from "../lib/errors.js";
import { getGlobalConfigDir, getGlobalConfigPath, PROJECT_CONFIG_FILENAMES } from "./paths.js";
import { configSchema, emptyConfig, type Config, type SourceEntry } from "./schema.js";

export interface LoadOptions {
  cwd?: string;
  globalPath?: string;
}

export interface LoadedConfig {
  config: Config;
  globalPath: string;
  projectPath: string | undefined;
  globalExists: boolean;
}

function readJsonFile(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new ConfigError(`failed to parse JSON at ${path}`, {
      hint: "check the file for syntax errors",
      cause: err,
    });
  }
}

function parseConfig(data: unknown, path: string): Config {
  const result = configSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const fieldPath = issue?.path.join(".") ?? "<root>";
    const msg = issue?.message ?? "validation failed";
    throw new ConfigError(`invalid config at ${path}: ${fieldPath}: ${msg}`, {
      hint: "run 'apeek config path' to locate the file and correct the offending field",
    });
  }
  return result.data;
}

function findProjectConfig(cwd: string): string | undefined {
  const found = PROJECT_CONFIG_FILENAMES.filter((name) => existsSync(join(cwd, name)));
  if (found.length === 0) return undefined;
  if (found.length > 1) {
    throw new ConfigError(
      `found both ${found.join(" and ")} in ${cwd}; only one project config file is allowed`,
      { hint: "remove one of the files and retry" },
    );
  }
  return join(cwd, found[0]!);
}

function mergeConfigs(global: Config, project: Config): Config {
  const merged: Config = {
    version: global.version,
    sources: { ...global.sources },
  };
  if (project.defaultSource !== undefined) {
    merged.defaultSource = project.defaultSource;
  } else if (global.defaultSource !== undefined) {
    merged.defaultSource = global.defaultSource;
  }
  const defaults = { ...(global.defaults ?? {}), ...(project.defaults ?? {}) };
  if (Object.keys(defaults).length > 0) {
    merged.defaults = defaults;
  }
  for (const [alias, entry] of Object.entries(project.sources)) {
    const existing = merged.sources[alias];
    merged.sources[alias] = mergeSourceEntry(existing, entry);
  }
  return merged;
}

function mergeSourceEntry(base: SourceEntry | undefined, overlay: SourceEntry): SourceEntry {
  if (base === undefined) return overlay;
  const merged: SourceEntry = { ...base, ...overlay };
  if (base.headers !== undefined || overlay.headers !== undefined) {
    merged.headers = { ...(base.headers ?? {}), ...(overlay.headers ?? {}) };
  }
  return merged;
}

export function loadGlobalConfigOnly(globalPath: string = getGlobalConfigPath()): Config {
  if (!existsSync(globalPath)) return emptyConfig();
  return parseConfig(readJsonFile(globalPath), globalPath);
}

export function writeGlobalConfig(
  config: Config,
  globalPath: string = getGlobalConfigPath(),
): void {
  const parsed = configSchema.safeParse(config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ConfigError(
      `refusing to write invalid config: ${issue?.path.join(".") ?? "<root>"}: ${issue?.message ?? "validation failed"}`,
    );
  }
  const dir = dirname(globalPath);
  if (globalPath === getGlobalConfigPath()) {
    mkdirSync(getGlobalConfigDir(), { recursive: true });
  } else {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${globalPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(parsed.data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, globalPath);
}

export function loadConfig(opts: LoadOptions = {}): LoadedConfig {
  const globalPath = opts.globalPath ?? getGlobalConfigPath();
  const cwd = resolve(opts.cwd ?? process.cwd());

  const globalExists = existsSync(globalPath);
  const global: Config = globalExists
    ? parseConfig(readJsonFile(globalPath), globalPath)
    : emptyConfig();

  const projectPath = findProjectConfig(cwd);
  if (projectPath === undefined) {
    return { config: global, globalPath, projectPath: undefined, globalExists };
  }

  const projectData = parseConfig(readJsonFile(projectPath), projectPath);
  return {
    config: mergeConfigs(global, projectData),
    globalPath,
    projectPath,
    globalExists,
  };
}
