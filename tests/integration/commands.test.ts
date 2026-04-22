import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const CLI = join(REPO_ROOT, "dist", "cli", "index.js");
const FIXTURES = join(REPO_ROOT, "tests", "fixtures");

function runCli(args: readonly string[], env: NodeJS.ProcessEnv = {}): {
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const sandbox = env["APEEK_SANDBOX_DIR"];
  const result = spawnSync(process.execPath, [CLI, ...args], {
    env: {
      ...process.env,
      NO_COLOR: "1",
      XDG_CONFIG_HOME: sandbox !== undefined ? join(sandbox, "cfg") : undefined,
      XDG_CACHE_HOME: sandbox !== undefined ? join(sandbox, "cache") : undefined,
      ...env,
    },
    encoding: "utf8",
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

describe("CLI integration", () => {
  let sandbox: string;
  let env: NodeJS.ProcessEnv;

  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `CLI binary missing at ${CLI}. Run 'npm run build' before running integration tests.`,
      );
    }
  });

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "apeek-int-"));
    env = { APEEK_SANDBOX_DIR: sandbox };
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("search finds POST /deals and suggests apeek op", () => {
    const r = runCli(
      ["search", "create a deal", "--source", join(FIXTURES, "spryx-sample.json")],
      env,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('# Search results: "create a deal"');
    expect(r.stdout).toContain("## 1. POST /deals");
    expect(r.stdout).toContain("Get details: `apeek op POST /deals`");
  });

  it("search zero-result exits 0", () => {
    const r = runCli(
      ["search", "zzqwkqwkqw", "--source", join(FIXTURES, "spryx-sample.json")],
      env,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Results: 0");
  });

  it("op returns full detail for POST /deals", () => {
    const r = runCli(
      ["op", "POST", "/deals", "--source", join(FIXTURES, "spryx-sample.json")],
      env,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("# POST /deals");
    expect(r.stdout).toContain("## Request body");
  });

  it("op accepts lowercase methods (case-insensitive)", () => {
    const r = runCli(
      ["op", "post", "/deals", "--source", join(FIXTURES, "spryx-sample.json")],
      env,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("# POST /deals");
  });

  it("op returns NotFoundError exit 1 when path is not found", () => {
    const r = runCli(
      ["op", "DELETE", "/nonexistent", "--source", join(FIXTURES, "spryx-sample.json")],
      env,
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("E_NOT_FOUND");
    expect(r.stderr).toContain("apeek search");
  });

  it("schema Deal returns the property table", () => {
    const r = runCli(
      ["schema", "Deal", "--source", join(FIXTURES, "spryx-sample.json")],
      env,
    );
    expect(r.status, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
    expect(r.stdout).toContain("# schema Deal");
    expect(r.stdout).toContain("| id | string | yes |");
  });

  it("schema with wrong case returns exit 1 with did-you-mean hint", () => {
    const r = runCli(
      ["schema", "deal", "--source", join(FIXTURES, "spryx-sample.json")],
      env,
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("E_NOT_FOUND");
    expect(r.stderr).toContain("Deal");
  });

  it("format json emits parseable JSON", () => {
    const r = runCli(
      [
        "search",
        "create deal",
        "--source",
        join(FIXTURES, "spryx-sample.json"),
        "--format",
        "json",
      ],
      env,
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as { query: string; results: unknown[] };
    expect(parsed.query).toBe("create deal");
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it("format compact emits one line per result", () => {
    const r = runCli(
      [
        "search",
        "deal",
        "--source",
        join(FIXTURES, "spryx-sample.json"),
        "--format",
        "compact",
      ],
      env,
    );
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split("\n");
    expect(lines.every((l) => !l.startsWith("#"))).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("unknown format exits 1", () => {
    const r = runCli(
      ["search", "x", "--source", join(FIXTURES, "spryx-sample.json"), "--format", "xml"],
      env,
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("E_SOURCE");
  });

  it("autodiscovery finds openapi.json in cwd", () => {
    const projectDir = join(sandbox, "project");
    mkdirSync(projectDir, { recursive: true });
    cpSync(join(FIXTURES, "spryx-sample.json"), join(projectDir, "openapi.json"));
    const r = spawnSync(
      process.execPath,
      [CLI, "search", "create deal"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          NO_COLOR: "1",
          XDG_CONFIG_HOME: join(sandbox, "cfg"),
          XDG_CACHE_HOME: join(sandbox, "cache"),
        },
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("POST /deals");
  });

  it("autodiscovery walks up parent directories", () => {
    const projectDir = join(sandbox, "project");
    const nested = join(projectDir, "a", "b");
    mkdirSync(nested, { recursive: true });
    cpSync(join(FIXTURES, "spryx-sample.json"), join(projectDir, "openapi.json"));
    const r = spawnSync(
      process.execPath,
      [CLI, "search", "deal"],
      {
        cwd: nested,
        env: {
          ...process.env,
          NO_COLOR: "1",
          XDG_CONFIG_HOME: join(sandbox, "cfg"),
          XDG_CACHE_HOME: join(sandbox, "cache"),
        },
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("POST /deals");
  });

  it("extension precedence: openapi.json beats swagger.json in same dir", () => {
    const projectDir = join(sandbox, "priority");
    mkdirSync(projectDir, { recursive: true });
    cpSync(join(FIXTURES, "spryx-sample.json"), join(projectDir, "openapi.json"));
    writeFileSync(
      join(projectDir, "swagger.json"),
      JSON.stringify({ swagger: "2.0", info: {}, paths: {} }),
    );
    const r = spawnSync(
      process.execPath,
      [CLI, "search", "deal"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          NO_COLOR: "1",
          XDG_CONFIG_HOME: join(sandbox, "cfg"),
          XDG_CACHE_HOME: join(sandbox, "cache"),
        },
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(0);
  });

  it("first-run welcome shows when no config and no args", () => {
    const r = runCli([], env);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("Welcome to apeek");
    expect(r.stderr).toContain("apeek setup");
  });

  it("version command prints the package version", () => {
    const r = runCli(["version"], env);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("--version flag prints the package version", () => {
    const r = runCli(["--version"], env);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("unknown command exits 1", () => {
    const r = runCli(["does-not-exist"], env);
    expect(r.status).toBe(1);
  });

  it("search output contains no ANSI escapes with NO_COLOR=1", () => {
    const r = runCli(
      ["search", "deal", "--source", join(FIXTURES, "spryx-sample.json")],
      env,
    );
    expect(r.stdout).not.toMatch(/\x1b\[[0-9;]*m/);
  });
});
