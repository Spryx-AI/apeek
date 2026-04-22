import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { parseSpec } from "../../src/core/parser.js";
import { buildIndex, search } from "../../src/core/indexer.js";

const fixturesDir = join(process.cwd(), "tests", "fixtures");

async function indexPetstore() {
  const raw = await readFile(join(fixturesDir, "petstore.yaml"), "utf8");
  const spec = await parseSpec(yaml.load(raw));
  return { spec, index: buildIndex(spec) };
}

async function indexSpryx() {
  const raw = await readFile(join(fixturesDir, "spryx-sample.json"), "utf8");
  const spec = await parseSpec(JSON.parse(raw));
  return { spec, index: buildIndex(spec) };
}

describe("indexer", () => {
  it("finds an operation by operationId", async () => {
    const { index } = await indexPetstore();
    const hits = search(index, "createPet", { limit: 5 });
    expect(hits[0]?.kind).toBe("operation");
    expect(hits[0]?.id).toBe("POST /pets");
  });

  it("finds an operation by summary keyword", async () => {
    const { index } = await indexPetstore();
    const hits = search(index, "list pets", { limit: 5 });
    expect(hits.find((h) => h.kind === "operation" && h.id === "GET /pets")).toBeDefined();
  });

  it("finds an operation by path segment", async () => {
    const { index } = await indexSpryx();
    const hits = search(index, "conversations", { limit: 5 });
    expect(
      hits.some((h) => h.kind === "operation" && h.id === "GET /conversations/{conversation_id}"),
    ).toBe(true);
  });

  it("finds a schema by name", async () => {
    const { index } = await indexSpryx();
    const hits = search(index, "Conversation", { limit: 5 });
    const top = hits[0];
    expect(top?.kind).toBe("schema");
    expect(top?.id).toBe("Conversation");
  });

  it("operationId match outranks a parameter-description-only match", async () => {
    const { index } = await indexSpryx();
    const hits = search(index, "createDeal", { limit: 5 });
    const createDeal = hits.findIndex((h) => h.kind === "operation" && h.id === "POST /deals");
    expect(createDeal).toBe(0);
  });

  it("respects the limit option", async () => {
    const { index } = await indexSpryx();
    const hits = search(index, "deal", { limit: 1 });
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  it("returns empty array for empty query", async () => {
    const { index } = await indexSpryx();
    expect(search(index, "", { limit: 5 })).toEqual([]);
    expect(search(index, "   ", { limit: 5 })).toEqual([]);
  });

  it("survives a serialize/deserialize roundtrip", async () => {
    const { index } = await indexSpryx();
    // buildIndex returns serialized JSON; search loads it again
    const first = search(index, "advance", { limit: 3 });
    const second = search(index, "advance", { limit: 3 });
    expect(first).toEqual(second);
  });

  it("returns no hits when query matches nothing", async () => {
    const { index } = await indexPetstore();
    expect(search(index, "qzxkwiuruwoeiurwoe", { limit: 5 })).toEqual([]);
  });
});
