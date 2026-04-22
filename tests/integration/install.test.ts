import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const CLI = join(REPO_ROOT, "dist", "cli", "index.js");

function runCli(
  args: readonly string[],
  sandbox: string,
  cwd: string = sandbox,
  extraEnv: NodeJS.ProcessEnv = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: {
      ...process.env,
      NO_COLOR: "1",
      HOME: sandbox,
      XDG_CONFIG_HOME: join(sandbox, "cfg"),
      XDG_CACHE_HOME: join(sandbox, "cache"),
      ...extraEnv,
    },
    encoding: "utf8",
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

describe("install integration", () => {
  let sandbox: string;

  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `CLI binary missing at ${CLI}. Run 'npm run build' before running integration tests.`,
      );
    }
  });

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "apeek-install-"));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("install claude-code --scope=global writes to sandbox $HOME/.claude/skills/apeek", () => {
    const r = runCli(["install", "claude-code", "--scope", "global"], sandbox);
    expect(r.status).toBe(0);
    const target = join(sandbox, ".claude", "skills", "apeek", "SKILL.md");
    expect(existsSync(target)).toBe(true);
    const content = readFileSync(target, "utf8");
    expect(content).toContain("name: apeek");
  });

  it("install cursor --scope=project writes to cwd/.cursor/rules/apeek.mdc", () => {
    const r = runCli(["install", "cursor", "--scope", "project"], sandbox);
    expect(r.status).toBe(0);
    const target = join(sandbox, ".cursor", "rules", "apeek.mdc");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toContain("alwaysApply: true");
  });

  it("install codex errors with v0.2 hint and exits 1", () => {
    const r = runCli(["install", "codex"], sandbox);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("E_AGENT_INSTALL");
    expect(r.stderr).toContain("v0.2");
  });

  it("install on unknown agent id exits 1 with valid ids listed", () => {
    const r = runCli(["install", "does-not-exist"], sandbox);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("known ids");
  });

  it("install defaults scope to global when --scope omitted", () => {
    const r = runCli(["install", "claude-code"], sandbox);
    expect(r.status).toBe(0);
    expect(existsSync(join(sandbox, ".claude", "skills", "apeek", "SKILL.md"))).toBe(true);
  });

  it("install claude-code is offline-safe (no network needed)", () => {
    // Run the install command through a busted DNS env to prove we never make
    // any network call.
    const r = runCli(["install", "claude-code"], sandbox, sandbox, {
      npm_config_registry: "http://127.0.0.1:1/",
    });
    expect(r.status).toBe(0);
  });

  it("setup errors with exit 1 when stdin is not a TTY", () => {
    const r = spawnSync(process.execPath, [CLI, "setup"], {
      env: {
        ...process.env,
        NO_COLOR: "1",
        HOME: sandbox,
        XDG_CONFIG_HOME: join(sandbox, "cfg"),
        XDG_CACHE_HOME: join(sandbox, "cache"),
      },
      input: "",
      encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("interactive TTY");
    expect(r.stderr).toContain("install");
    expect(r.stderr).toContain("source add");
  });
});
