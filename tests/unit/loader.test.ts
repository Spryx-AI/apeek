import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/loader.js";
import { ConfigError } from "../../src/lib/errors.js";

describe("loadConfig", () => {
  let root: string;
  let globalPath: string;
  let projectDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "apeek-loader-"));
    globalPath = join(root, "global-config.json");
    projectDir = join(root, "project");
    mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns empty config when no global file exists and no project file", () => {
    const { config, globalExists, projectPath } = loadConfig({
      cwd: projectDir,
      globalPath,
    });
    expect(globalExists).toBe(false);
    expect(projectPath).toBeUndefined();
    expect(config.version).toBe(1);
    expect(config.sources).toEqual({});
  });

  it("loads a valid global config", () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        version: 1,
        defaultSource: "spryx",
        sources: {
          spryx: { url: "https://api.spryx.ai/openapi.json" },
        },
      }),
    );
    const { config, globalExists } = loadConfig({ cwd: projectDir, globalPath });
    expect(globalExists).toBe(true);
    expect(config.defaultSource).toBe("spryx");
    expect(config.sources["spryx"]?.url).toBe("https://api.spryx.ai/openapi.json");
  });

  it("rejects invalid JSON", () => {
    writeFileSync(globalPath, "{ not valid");
    expect(() => loadConfig({ cwd: projectDir, globalPath })).toThrowError(ConfigError);
  });

  it("rejects schema violations", () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        version: 2,
        sources: {},
      }),
    );
    expect(() => loadConfig({ cwd: projectDir, globalPath })).toThrowError(ConfigError);
  });

  it("rejects a source entry with both url and path", () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        version: 1,
        sources: { bad: { url: "https://x.test/o.json", path: "/tmp/o.json" } },
      }),
    );
    expect(() => loadConfig({ cwd: projectDir, globalPath })).toThrowError(ConfigError);
  });

  it("rejects a source entry with neither url nor path", () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        version: 1,
        sources: { bad: {} },
      }),
    );
    expect(() => loadConfig({ cwd: projectDir, globalPath })).toThrowError(ConfigError);
  });

  it("merges a project .apeekrc.json over the global config", () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        version: 1,
        defaultSource: "spryx",
        sources: { spryx: { url: "https://api.spryx.ai/openapi.json" } },
      }),
    );
    writeFileSync(
      join(projectDir, ".apeekrc.json"),
      JSON.stringify({
        version: 1,
        defaultSource: "internal",
        sources: { internal: { url: "https://internal.example/openapi.json" } },
      }),
    );
    const { config, projectPath } = loadConfig({ cwd: projectDir, globalPath });
    expect(projectPath).toBe(join(projectDir, ".apeekrc.json"));
    expect(config.defaultSource).toBe("internal");
    expect(Object.keys(config.sources).sort()).toEqual(["internal", "spryx"]);
  });

  it("project overlay does not mutate global config on disk", () => {
    const globalContent = {
      version: 1,
      defaultSource: "spryx",
      sources: { spryx: { url: "https://api.spryx.ai/openapi.json" } },
    };
    writeFileSync(globalPath, JSON.stringify(globalContent));
    writeFileSync(
      join(projectDir, ".apeekrc.json"),
      JSON.stringify({ version: 1, defaultSource: "other", sources: {} }),
    );
    loadConfig({ cwd: projectDir, globalPath });
    const onDisk = JSON.parse(readFileSync(globalPath, "utf8")) as unknown;
    expect(onDisk).toEqual(globalContent);
  });

  it("overlay deep-merges headers on a source that exists in both", () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        version: 1,
        sources: { spryx: { url: "https://x.test/o.json", headers: { A: "1" } } },
      }),
    );
    writeFileSync(
      join(projectDir, ".apeekrc.json"),
      JSON.stringify({
        version: 1,
        sources: { spryx: { url: "https://x.test/o.json", headers: { B: "2" } } },
      }),
    );
    const { config } = loadConfig({ cwd: projectDir, globalPath });
    expect(config.sources["spryx"]?.headers).toEqual({ A: "1", B: "2" });
  });

  it("errors when both project config files exist", () => {
    writeFileSync(
      join(projectDir, ".apeekrc.json"),
      JSON.stringify({ version: 1, sources: {} }),
    );
    writeFileSync(
      join(projectDir, "apeek.config.json"),
      JSON.stringify({ version: 1, sources: {} }),
    );
    expect(() => loadConfig({ cwd: projectDir, globalPath })).toThrowError(ConfigError);
  });

  it("leaves env placeholders in header values unresolved", () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        version: 1,
        sources: {
          spryx: {
            url: "https://x.test/o.json",
            headers: { Authorization: "Bearer ${MY_TOKEN}" },
          },
        },
      }),
    );
    const { config } = loadConfig({ cwd: projectDir, globalPath });
    expect(config.sources["spryx"]?.headers?.["Authorization"]).toBe("Bearer ${MY_TOKEN}");
  });
});
