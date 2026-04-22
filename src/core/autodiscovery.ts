import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const FILENAME_PRIORITY: readonly string[] = [
  "openapi.json",
  "openapi.yaml",
  "openapi.yml",
  "swagger.json",
  "swagger.yaml",
  "swagger.yml",
];

const SUBDIR_PREFIXES: readonly string[] = ["docs", "api"];

function candidatesIn(dir: string): string[] {
  const out: string[] = FILENAME_PRIORITY.map((name) => join(dir, name));
  for (const sub of SUBDIR_PREFIXES) {
    for (const name of FILENAME_PRIORITY) {
      out.push(join(dir, sub, name));
    }
  }
  return out;
}

export function discoverSpecFile(startDir: string): string | undefined {
  let current = resolve(startDir);
  while (true) {
    for (const candidate of candidatesIn(current)) {
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
