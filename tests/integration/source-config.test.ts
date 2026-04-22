import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const CLI = join(REPO_ROOT, "dist", "cli", "index.js");
const FIXTURES = join(REPO_ROOT, "tests", "fixtures");

function runCli(
  args: readonly string[],
  sandbox: string,
  extraEnv: NodeJS.ProcessEnv = {},
  cwd: string = sandbox,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: {
      ...process.env,
      NO_COLOR: "1",
      XDG_CONFIG_HOME: join(sandbox, "cfg"),
      XDG_CACHE_HOME: join(sandbox, "cache"),
      HOME: sandbox,
      ...extraEnv,
    },
    encoding: "utf8",
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

describe("source and config integration", () => {
  let sandbox: string;
  const globalConfigPath = (root: string): string =>
    join(root, "cfg", "apeek", "config.json");

  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `CLI binary missing at ${CLI}. Run 'npm run build' before running integration tests.`,
      );
    }
  });

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "apeek-src-"));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("source add → list → use → info → remove lifecycle", () => {
    const specPath = join(FIXTURES, "spryx-sample.json");

    const add1 = runCli(["source", "add", "spryx", specPath], sandbox);
    expect(add1.status).toBe(0);
    expect(add1.stderr).toContain("added source 'spryx'");

    const add2 = runCli(
      ["source", "add", "petstore", join(FIXTURES, "petstore.yaml")],
      sandbox,
    );
    expect(add2.status).toBe(0);

    const list = runCli(["source", "list"], sandbox);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain("spryx");
    expect(list.stdout).toContain("petstore");
    // first-added should be the default (marked with *)
    expect(list.stdout.split("\n").find((l) => l.startsWith("*"))).toContain("spryx");

    const use = runCli(["source", "use", "petstore"], sandbox);
    expect(use.status).toBe(0);
    expect(use.stderr).toContain("petstore");

    const listAfterUse = runCli(["source", "list"], sandbox);
    expect(listAfterUse.stdout.split("\n").find((l) => l.startsWith("*"))).toContain("petstore");

    const info = runCli(["source", "info", "spryx"], sandbox);
    expect(info.status).toBe(0);
    expect(info.stdout).toContain("alias:   spryx");

    const remove = runCli(["source", "remove", "petstore"], sandbox);
    expect(remove.status).toBe(0);

    const listAfterRemove = runCli(["source", "list"], sandbox);
    expect(listAfterRemove.stdout).not.toContain("petstore");
    // removing default should unset defaultSource (no *)
    expect(listAfterRemove.stdout.split("\n").some((l) => l.startsWith("*"))).toBe(false);
  });

  it("duplicate alias is rejected", () => {
    const path = join(FIXTURES, "spryx-sample.json");
    runCli(["source", "add", "x", path], sandbox);
    const r = runCli(["source", "add", "x", path], sandbox);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("already exists");
  });

  it("http:// is rejected without --allow-insecure", () => {
    const r = runCli(["source", "add", "a", "http://example.com/openapi.json"], sandbox);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("plain HTTP");
  });

  it("http:// is accepted with --allow-insecure", () => {
    const r = runCli(
      ["source", "add", "a", "http://example.com/openapi.json", "--allow-insecure"],
      sandbox,
    );
    expect(r.status).toBe(0);
    const config = JSON.parse(readFileSync(globalConfigPath(sandbox), "utf8")) as {
      sources: Record<string, { allowInsecure?: boolean }>;
    };
    expect(config.sources["a"]?.allowInsecure).toBe(true);
  });

  it("source info never prints resolved secret values", () => {
    const r = runCli(
      [
        "source",
        "add",
        "s",
        "https://example.com/o.json",
        "--header",
        "Authorization=Bearer ${MY_TEST_TOKEN}",
      ],
      sandbox,
      { MY_TEST_TOKEN: "resolved-secret-value" },
    );
    expect(r.status).toBe(0);

    const info = runCli(["source", "info", "s"], sandbox, {
      MY_TEST_TOKEN: "resolved-secret-value",
    });
    expect(info.stdout).toContain("${MY_TEST_TOKEN}");
    expect(info.stdout).not.toContain("resolved-secret-value");
  });

  it("project .apeekrc.json overlays global config without mutating global file", () => {
    const globalPath = join(FIXTURES, "spryx-sample.json");
    runCli(["source", "add", "spryx", globalPath], sandbox);

    const projectDir = join(sandbox, "project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".apeekrc.json"),
      JSON.stringify({
        version: 1,
        defaultSource: "local",
        sources: { local: { path: join(FIXTURES, "petstore.yaml") } },
      }),
    );

    const search = runCli(["search", "pet"], sandbox, {}, projectDir);
    expect(search.status).toBe(0);
    expect(search.stdout).toContain("pets"); // from petstore fixture

    // Global config must be unchanged
    const globalContent = JSON.parse(readFileSync(globalConfigPath(sandbox), "utf8")) as {
      defaultSource?: string;
      sources: Record<string, unknown>;
    };
    expect(globalContent.defaultSource).toBe("spryx");
    expect(Object.keys(globalContent.sources)).toEqual(["spryx"]);
  });

  it("both project config files present exits 2 when merged loader runs", () => {
    runCli(["source", "add", "x", join(FIXTURES, "spryx-sample.json")], sandbox);
    const projectDir = join(sandbox, "both");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, ".apeekrc.json"),
      JSON.stringify({ version: 1, sources: {} }),
    );
    writeFileSync(
      join(projectDir, "apeek.config.json"),
      JSON.stringify({ version: 1, sources: {} }),
    );
    // Any command that goes through the merged loader should surface the error.
    const r = runCli(["search", "anything", "--source", "x"], sandbox, {}, projectDir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("only one project config file is allowed");
  });

  it("missing env var in header raises MissingEnvError during fetch", () => {
    runCli(
      [
        "source",
        "add",
        "s",
        "https://example.com/o.json",
        "--header",
        "Authorization=Bearer ${MISSING_CLI_TOKEN_XYZ}",
      ],
      sandbox,
    );
    const r = runCli(["search", "x", "--source", "s"], sandbox, {});
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("E_MISSING_ENV");
    expect(r.stderr).toContain("MISSING_CLI_TOKEN_XYZ");
  });

  it("config get/set/path round-trips a defaultSource write", () => {
    runCli(["source", "add", "a", join(FIXTURES, "spryx-sample.json")], sandbox);
    runCli(["source", "add", "b", join(FIXTURES, "petstore.yaml")], sandbox);

    const setRes = runCli(["config", "set", "defaultSource", "b"], sandbox);
    expect(setRes.status).toBe(0);

    const getRes = runCli(["config", "get", "defaultSource"], sandbox);
    expect(getRes.status).toBe(0);
    expect(getRes.stdout.trim()).toBe("b");

    const pathRes = runCli(["config", "path"], sandbox);
    expect(pathRes.status).toBe(0);
    expect(pathRes.stdout.trim()).toBe(globalConfigPath(sandbox));
  });

  it("config set rejects non-writable keys without mutating disk", () => {
    runCli(["source", "add", "a", join(FIXTURES, "spryx-sample.json")], sandbox);
    const before = readFileSync(globalConfigPath(sandbox), "utf8");
    const r = runCli(["config", "set", "sources.a.url", "https://evil.com"], sandbox);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("not writable");
    expect(readFileSync(globalConfigPath(sandbox), "utf8")).toBe(before);
  });

  it("config set rejects invalid types (limit must be integer)", () => {
    runCli(["source", "add", "a", join(FIXTURES, "spryx-sample.json")], sandbox);
    const before = readFileSync(globalConfigPath(sandbox), "utf8");
    const r = runCli(["config", "set", "defaults.limit", "not-a-number"], sandbox);
    expect(r.status).toBe(2);
    expect(readFileSync(globalConfigPath(sandbox), "utf8")).toBe(before);
  });

  it("source remove deletes the cache directory", () => {
    const path = join(FIXTURES, "spryx-sample.json");
    runCli(["source", "add", "s", path], sandbox);
    runCli(["search", "deal", "--source", "s"], sandbox);
    runCli(["source", "remove", "s"], sandbox);
    const cacheRoot = join(sandbox, "cache", "apeek");
    if (existsSync(cacheRoot)) {
      expect(readdirSync(cacheRoot).length).toBe(0);
    }
  });

  it("config get on nonexistent key exits 1", () => {
    runCli(["source", "add", "a", join(FIXTURES, "spryx-sample.json")], sandbox);
    const r = runCli(["config", "get", "does.not.exist"], sandbox);
    expect(r.status).toBe(1);
  });
});
