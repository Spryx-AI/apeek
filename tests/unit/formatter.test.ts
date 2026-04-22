import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { parseSpec } from "../../src/core/parser.js";
import { selectRenderer } from "../../src/core/formatter/index.js";
import { SourceError } from "../../src/lib/errors.js";
import type {
  NormalizedOperation,
  NormalizedSchema,
  NormalizedSpec,
} from "../../src/types.js";
import type { SearchInput, SourceInfo } from "../../src/core/formatter/types.js";

const fixturesDir = join(process.cwd(), "tests", "fixtures");

async function loadSpryxSpec(): Promise<NormalizedSpec> {
  const raw = await readFile(join(fixturesDir, "spryx-sample.json"), "utf8");
  return parseSpec(JSON.parse(raw));
}

async function loadPetstoreSpec(): Promise<NormalizedSpec> {
  const raw = await readFile(join(fixturesDir, "petstore.yaml"), "utf8");
  return parseSpec(yaml.load(raw));
}

function source(): SourceInfo {
  return { alias: "spryx", location: "https://api.spryx.example/v1/openapi.json" };
}

function findOperation(spec: NormalizedSpec, predicate: (op: NormalizedOperation) => boolean): NormalizedOperation {
  const op = spec.operations.find(predicate);
  if (op === undefined) throw new Error("operation not found in fixture");
  return op;
}

function findSchema(spec: NormalizedSpec, name: string): NormalizedSchema {
  const s = spec.schemas[name];
  if (s === undefined) throw new Error(`schema ${name} missing`);
  return s;
}

const ANSI_ESCAPE = /\x1b\[[0-9;]*m/;

describe("selectRenderer", () => {
  it("returns markdown/json/compact renderers for valid formats", () => {
    expect(selectRenderer("markdown")).toBeDefined();
    expect(selectRenderer("json")).toBeDefined();
    expect(selectRenderer("compact")).toBeDefined();
  });

  it("throws SourceError for unknown format", () => {
    expect(() => selectRenderer("xml")).toThrowError(SourceError);
  });
});

describe("markdown renderer", () => {
  it("renders a search result with h1, source, and ranked h2 sections", async () => {
    const spec = await loadSpryxSpec();
    const op = findOperation(spec, (o) => o.operationId === "createDeal");
    const input: SearchInput = {
      query: "create a deal",
      source: source(),
      results: [{ kind: "operation", operation: op, score: 0.94 }],
    };
    const out = selectRenderer("markdown").renderSearch(input);
    expect(out).toContain('# Search results: "create a deal"');
    expect(out).toContain("Source: spryx (https://api.spryx.example/v1/openapi.json)");
    expect(out).toContain("Results: 1");
    expect(out).toContain("## 1. POST /deals — Create a deal");
    expect(out).toContain("Get details: `apeek op POST /deals`");
  });

  it("renders an operation with request body and responses", async () => {
    const spec = await loadSpryxSpec();
    const op = findOperation(spec, (o) => o.operationId === "createDeal");
    const out = selectRenderer("markdown").renderOp({ source: source(), operation: op });
    expect(out).toContain("# POST /deals");
    expect(out).toContain("**Summary:** Create a deal");
    expect(out).toContain("## Request body (application/json)");
    expect(out).toContain("| name | string | yes |");
    expect(out).toContain("## Responses");
    expect(out).toContain("- **201**");
    expect(out).toContain("- **400**");
  });

  it("omits sections that have no data (parameters, requestBody)", async () => {
    const spec = await loadPetstoreSpec();
    const listPets = findOperation(spec, (o) => o.operationId === "listPets");
    const out = selectRenderer("markdown").renderOp({ source: source(), operation: listPets });
    expect(out).not.toContain("## Request body");
    expect(out).toContain("## Parameters");
  });

  it("omits description line on schemas with no description", async () => {
    const spec = await loadSpryxSpec();
    const dealCreate = findSchema(spec, "DealCreate");
    const out = selectRenderer("markdown").renderSchema({ source: source(), schema: dealCreate });
    expect(out).toContain("# schema DealCreate");
    const lines = out.split("\n").slice(0, 3);
    // line 0 is h1, line 1 is blank, line 2 should be the table header, not a description
    expect(lines[2]).toMatch(/^\|/);
  });

  it("emits no ANSI escape sequences", async () => {
    const spec = await loadPetstoreSpec();
    const op = findOperation(spec, (o) => o.operationId === "createPet");
    const out =
      selectRenderer("markdown").renderOp({ source: source(), operation: op }) +
      selectRenderer("markdown").renderSearch({
        query: "pet",
        source: source(),
        results: [{ kind: "operation", operation: op, score: 0.5 }],
      });
    expect(ANSI_ESCAPE.test(out)).toBe(false);
  });

  it("renders schema enums in the description column", async () => {
    const spec = await loadSpryxSpec();
    const deal = findSchema(spec, "Deal");
    const out = selectRenderer("markdown").renderSchema({ source: source(), schema: deal });
    expect(out).toContain("one of:");
    expect(out).toContain('"open"');
    expect(out).toContain('"won"');
  });

  it("zero-result search renders empty but valid structure", async () => {
    const out = selectRenderer("markdown").renderSearch({
      query: "zzz",
      source: source(),
      results: [],
    });
    expect(out).toContain("Results: 0");
    expect(out).not.toContain("## 1.");
  });
});

describe("json renderer", () => {
  it("produces parseable JSON for search", async () => {
    const spec = await loadSpryxSpec();
    const op = findOperation(spec, (o) => o.operationId === "createDeal");
    const raw = selectRenderer("json").renderSearch({
      query: "deal",
      source: source(),
      results: [{ kind: "operation", operation: op, score: 0.9 }],
    });
    const parsed = JSON.parse(raw) as {
      query: string;
      results: Array<{ kind: string; method: string; path: string; score: number }>;
    };
    expect(parsed.query).toBe("deal");
    expect(parsed.results[0]?.kind).toBe("operation");
    expect(parsed.results[0]?.method).toBe("POST");
    expect(parsed.results[0]?.path).toBe("/deals");
  });

  it("produces parseable JSON for op", async () => {
    const spec = await loadPetstoreSpec();
    const op = findOperation(spec, (o) => o.operationId === "getPet");
    const raw = selectRenderer("json").renderOp({ source: source(), operation: op });
    const parsed = JSON.parse(raw) as { method: string; path: string };
    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/pets/{pet_id}");
  });

  it("produces parseable JSON for schema", async () => {
    const spec = await loadSpryxSpec();
    const raw = selectRenderer("json").renderSchema({
      source: source(),
      schema: findSchema(spec, "Deal"),
    });
    const parsed = JSON.parse(raw) as { name: string };
    expect(parsed.name).toBe("Deal");
  });
});

describe("compact renderer", () => {
  it("renders one line per search result with no headings or metadata", async () => {
    const spec = await loadSpryxSpec();
    const createDeal = findOperation(spec, (o) => o.operationId === "createDeal");
    const advance = findOperation(spec, (o) => o.operationId === "advanceDealStage");
    const out = selectRenderer("compact").renderSearch({
      query: "deal",
      source: source(),
      results: [
        { kind: "operation", operation: createDeal, score: 0.9 },
        { kind: "operation", operation: advance, score: 0.7 },
      ],
    });
    const lines = out.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("POST /deals — Create a deal");
    expect(lines[1]).toBe("POST /deals/{deal_id}/stages — Advance deal stage");
    expect(out).not.toContain("#");
    expect(out).not.toContain("Source:");
  });

  it("renders op as a single line", async () => {
    const spec = await loadPetstoreSpec();
    const op = findOperation(spec, (o) => o.operationId === "getPet");
    const out = selectRenderer("compact").renderOp({ source: source(), operation: op });
    expect(out).toBe("GET /pets/{pet_id} — Fetch one pet\n");
  });

  it("renders schema as a single line", async () => {
    const spec = await loadSpryxSpec();
    const out = selectRenderer("compact").renderSchema({
      source: source(),
      schema: findSchema(spec, "Deal"),
    });
    expect(out).toBe("schema Deal — A deal record.\n");
  });
});
