import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AgentInstallError } from "../lib/errors.js";

export function writeTemplateFile(
  path: string,
  content: string,
  opts: { mode?: number } = {},
): { overwritten: boolean } {
  const overwritten = existsSync(path);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { mode: opts.mode ?? 0o644 });
  } catch (err) {
    throw new AgentInstallError(`failed to write ${path}`, {
      hint: "check filesystem permissions",
      cause: err,
    });
  }
  return { overwritten };
}
