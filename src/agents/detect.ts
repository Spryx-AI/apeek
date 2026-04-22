import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DetectOpts, DetectResult } from "./registry.js";

export function homeOrDefault(opts?: DetectOpts): string {
  return opts?.home ?? homedir();
}

export function cwdOrDefault(opts?: DetectOpts): string {
  return opts?.cwd ?? process.cwd();
}

function probe(path: string, marker: string): DetectResult {
  if (existsSync(path)) return { detected: true, marker };
  return { detected: false };
}

export function detectClaudeCode(opts?: DetectOpts): DetectResult {
  const p = join(homeOrDefault(opts), ".claude");
  return probe(p, "~/.claude/");
}

export function detectCursor(opts?: DetectOpts): DetectResult {
  const project = join(cwdOrDefault(opts), ".cursor");
  if (existsSync(project)) return { detected: true, marker: "./.cursor/" };
  const home = join(homeOrDefault(opts), ".cursor");
  if (existsSync(home)) return { detected: true, marker: "~/.cursor/" };
  return { detected: false };
}

export function detectCodex(opts?: DetectOpts): DetectResult {
  return probe(join(homeOrDefault(opts), ".codex"), "~/.codex/");
}

export function detectWindsurf(opts?: DetectOpts): DetectResult {
  const project = join(cwdOrDefault(opts), ".windsurfrules");
  if (existsSync(project)) return { detected: true, marker: "./.windsurfrules" };
  const home = join(homeOrDefault(opts), ".windsurf");
  if (existsSync(home)) return { detected: true, marker: "~/.windsurf/" };
  return { detected: false };
}

export function detectContinue(opts?: DetectOpts): DetectResult {
  return probe(join(homeOrDefault(opts), ".continue"), "~/.continue/");
}
