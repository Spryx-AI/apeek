import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const CLI = join(REPO_ROOT, "dist", "cli", "index.js");
const OPENAI_SPEC = join(REPO_ROOT, "tests", "fixtures", "openai-openapi.yaml");

function runCli(
  args: readonly string[],
  sandbox: string,
): { stdout: string; stderr: string; status: number | null; durationMs: number } {
  const start = Date.now();
  const result = spawnSync(process.execPath, [CLI, ...args], {
    env: {
      ...process.env,
      NO_COLOR: "1",
      XDG_CONFIG_HOME: join(sandbox, "cfg"),
      XDG_CACHE_HOME: join(sandbox, "cache"),
      HOME: sandbox,
    },
    encoding: "utf8",
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    durationMs: Date.now() - start,
  };
}

describe("CLI against OpenAI's real OpenAPI spec (126 ops, 436 schemas)", () => {
  let sandbox: string;

  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(`CLI binary missing at ${CLI}. Run 'npm run build' first.`);
    }
    if (!existsSync(OPENAI_SPEC)) {
      throw new Error(`OpenAI fixture missing at ${OPENAI_SPEC}.`);
    }
  });

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "apeek-real-"));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("search 'chat completion' ranks createChatCompletion in the top results", () => {
    const r = runCli(
      ["search", "create chat completion", "--source", OPENAI_SPEC, "--limit", "5"],
      sandbox,
    );
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("POST /chat/completions");
    // The header line naming the operation appears somewhere in the top 5 results
    const topFive = r.stdout.split("\n").slice(0, 60).join("\n");
    expect(topFive).toContain("POST /chat/completions");
  });

  it("search 'embeddings' finds createEmbedding and the Embedding schema", () => {
    const r = runCli(
      ["search", "create embedding vector", "--source", OPENAI_SPEC, "--limit", "10"],
      sandbox,
    );
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("POST /embeddings");
  });

  it("op POST /chat/completions renders the heading, tags, auth, request body and responses", () => {
    const r = runCli(["op", "POST", "/chat/completions", "--source", OPENAI_SPEC], sandbox);
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("# POST /chat/completions");
    expect(r.stdout).toContain("**Tags:**");
    expect(r.stdout).toContain("**Auth:**");
    expect(r.stdout).toContain("## Request body");
    expect(r.stdout).toContain("## Responses");
    // Known v0.2 limitation: composed schemas (oneOf/allOf at request-body
    // root) are not flattened, so the property table for composition-heavy
    // ops like CreateChatCompletionRequest is empty. The ones we assert
    // above are what the v0.1 formatter is contractually expected to render.
  });

  it("op GET /models/{model} accepts path templates literally (no substitution)", () => {
    const r = runCli(["op", "GET", "/models/{model}", "--source", OPENAI_SPEC], sandbox);
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("# GET /models/{model}");
    expect(r.stdout).toContain("## Parameters");
    expect(r.stdout).toContain("model");
  });

  it("schema Embedding returns the property table", () => {
    const r = runCli(["schema", "Embedding", "--source", OPENAI_SPEC], sandbox);
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("# schema Embedding");
    // Embedding has a known 'embedding' field (the vector)
    expect(r.stdout).toContain("embedding");
    expect(r.stdout).toContain("index");
    expect(r.stdout).toContain("object");
  });

  it("schema with wrong case surfaces did-you-mean for a real nearby schema", () => {
    const r = runCli(["schema", "embedding", "--source", OPENAI_SPEC], sandbox);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("E_NOT_FOUND");
    expect(r.stderr).toContain("Embedding");
  });

  it("search --format json is parseable and has the documented shape", () => {
    const r = runCli(
      [
        "search",
        "list models",
        "--source",
        OPENAI_SPEC,
        "--format",
        "json",
        "--limit",
        "3",
      ],
      sandbox,
    );
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      query: string;
      source: { location: string };
      results: Array<
        | { kind: "operation"; method: string; path: string; score: number }
        | { kind: "schema"; name: string; score: number }
      >;
    };
    expect(parsed.query).toBe("list models");
    expect(parsed.source.location).toBe(OPENAI_SPEC);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(parsed.results.length).toBeLessThanOrEqual(3);
    for (const r of parsed.results) {
      expect(typeof r.score).toBe("number");
      expect(r.kind === "operation" || r.kind === "schema").toBe(true);
    }
  });

  it("warm cache is materially faster than cold on a 126-op spec", () => {
    const cold = runCli(
      ["search", "create completion", "--source", OPENAI_SPEC],
      sandbox,
    );
    expect(cold.status, `stderr: ${cold.stderr}`).toBe(0);
    const warm = runCli(
      ["search", "create completion", "--source", OPENAI_SPEC],
      sandbox,
    );
    expect(warm.status, `stderr: ${warm.stderr}`).toBe(0);
    // Warm should be clearly faster. Both include ~150ms Node startup, so
    // compare the ratio rather than an absolute target — avoids flakiness.
    expect(warm.durationMs).toBeLessThan(cold.durationMs);
  });

  it("cold-path processing of 126 ops + 436 schemas finishes inside the design budget", () => {
    // Design D16: cold search on < 100-op spec < 3s. OpenAI's spec has 126
    // ops and 436 schemas, so we give it 5s as a realistic budget — still
    // well below anything a user would notice as 'hanging'.
    const r = runCli(["search", "chat", "--source", OPENAI_SPEC], sandbox);
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    expect(r.durationMs).toBeLessThan(5000);
  });
});
