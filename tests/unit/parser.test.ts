import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { parseSpec } from "../../src/core/parser.js";
import { ParseError } from "../../src/lib/errors.js";

const fixturesDir = join(process.cwd(), "tests", "fixtures");

async function loadPetstore(): Promise<unknown> {
  const raw = await readFile(join(fixturesDir, "petstore.yaml"), "utf8");
  return yaml.load(raw);
}

async function loadSpryx(): Promise<unknown> {
  const raw = await readFile(join(fixturesDir, "spryx-sample.json"), "utf8");
  return JSON.parse(raw);
}

describe("parseSpec", () => {
  it("accepts OpenAPI 3.0", async () => {
    const spec = await parseSpec(await loadPetstore());
    expect(spec.openapi).toMatch(/^3\.0/);
    expect(spec.title).toBe("Petstore");
    expect(spec.operations.length).toBe(3);
  });

  it("accepts OpenAPI 3.1", async () => {
    const spec = await parseSpec(await loadSpryx());
    expect(spec.openapi).toMatch(/^3\.1/);
    expect(spec.operations.length).toBe(3);
  });

  it("extracts operations with method + path", async () => {
    const spec = await parseSpec(await loadPetstore());
    const methods = spec.operations.map((op) => `${op.method} ${op.path}`).sort();
    expect(methods).toEqual(["GET /pets", "GET /pets/{pet_id}", "POST /pets"]);
  });

  it("extracts operation metadata", async () => {
    const spec = await parseSpec(await loadPetstore());
    const createPet = spec.operations.find((op) => op.operationId === "createPet");
    expect(createPet).toBeDefined();
    expect(createPet?.summary).toBe("Create a pet");
    expect(createPet?.tags).toEqual(["pets"]);
    expect(createPet?.requestBody?.mediaType).toBe("application/json");
    expect(createPet?.responses.map((r) => r.status).sort()).toEqual(["201", "400"]);
  });

  it("resolves internal $refs so schemas appear inline", async () => {
    const spec = await parseSpec(await loadPetstore());
    const createPet = spec.operations.find((op) => op.operationId === "createPet");
    expect(createPet?.requestBody?.schema?.properties?.["name"]?.type).toBe("string");
  });

  it("extracts component schemas", async () => {
    const spec = await parseSpec(await loadPetstore());
    expect(Object.keys(spec.schemas).sort()).toEqual(["Error", "NewPet", "Pet"]);
    expect(spec.schemas["Pet"]?.properties?.["status"]?.enum).toEqual([
      "available",
      "pending",
      "sold",
    ]);
  });

  it("rejects Swagger 2.0 with a ParseError", async () => {
    const swagger = { swagger: "2.0", info: { title: "Old", version: "1" }, paths: {} };
    await expect(parseSpec(swagger)).rejects.toBeInstanceOf(ParseError);
  });

  it("rejects missing version field", async () => {
    await expect(parseSpec({ info: { title: "x", version: "1" }, paths: {} })).rejects.toBeInstanceOf(
      ParseError,
    );
  });

  it("rejects unsupported openapi versions like 4.0", async () => {
    await expect(
      parseSpec({ openapi: "4.0.0", info: { title: "x", version: "1" }, paths: {} }),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it("marks path parameters as required even without explicit required field", async () => {
    const spec = await parseSpec(await loadPetstore());
    const getPet = spec.operations.find((op) => op.operationId === "getPet");
    const pathParam = getPet?.parameters.find((p) => p.in === "path");
    expect(pathParam?.required).toBe(true);
  });

  it("handles cyclic schemas (self-reference after dereference) without stack overflow", async () => {
    // Build a spec where @readme/openapi-parser's dereference produces a true
    // object cycle: Node → properties.children.items → [same Node]. Repro of
    // the bug that showed up on the Spryx backend spec.
    const nodeSchema: Record<string, unknown> = { type: "object" };
    nodeSchema["properties"] = {
      id: { type: "string" },
      children: {
        type: "array",
        items: nodeSchema, // self-reference
      },
    };
    const spec = {
      openapi: "3.0.0",
      info: { title: "cyclic", version: "1" },
      paths: {
        "/nodes": {
          get: {
            operationId: "listNodes",
            summary: "List nodes",
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": { schema: nodeSchema },
                },
              },
            },
          },
        },
      },
      components: { schemas: { Node: nodeSchema } },
    };
    const parsed = await parseSpec(spec);
    expect(parsed.schemas["Node"]).toBeDefined();
    // The cyclic slot should be marked rather than recursed into
    const childItems = parsed.schemas["Node"]?.properties?.["children"]?.items;
    expect(childItems?.description).toBe("[cyclic reference]");
  });
});
