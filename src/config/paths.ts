import { homedir } from "node:os";
import { join } from "node:path";

const APP_NAME = "apeek";

function xdgPath(envVar: string, fallbackSegments: readonly string[]): string {
  const xdg = process.env[envVar];
  if (xdg !== undefined && xdg !== "") {
    return join(xdg, APP_NAME);
  }
  return join(homedir(), ...fallbackSegments, APP_NAME);
}

export function getGlobalConfigDir(): string {
  return xdgPath("XDG_CONFIG_HOME", [".config"]);
}

export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), "config.json");
}

export function getCacheRoot(): string {
  return xdgPath("XDG_CACHE_HOME", [".cache"]);
}

export const PROJECT_CONFIG_FILENAMES: readonly string[] = [
  ".apeekrc.json",
  "apeek.config.json",
];
