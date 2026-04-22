import type { OpInput, Renderer, SchemaRenderInput, SearchInput } from "./types.js";

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export const jsonRenderer: Renderer = {
  renderSearch(input: SearchInput): string {
    return serialize({
      query: input.query,
      source: input.source,
      results: input.results.map((r) =>
        r.kind === "operation"
          ? {
              kind: "operation",
              method: r.operation.method,
              path: r.operation.path,
              operationId: r.operation.operationId,
              summary: r.operation.summary,
              tags: r.operation.tags,
              score: r.score,
            }
          : {
              kind: "schema",
              name: r.schema.name,
              description: r.schema.description,
              score: r.score,
            },
      ),
    });
  },
  renderOp(input: OpInput): string {
    const op = input.operation;
    return serialize({
      method: op.method,
      path: op.path,
      operationId: op.operationId,
      summary: op.summary,
      description: op.description,
      tags: op.tags,
      security: op.security,
      parameters: op.parameters,
      requestBody: op.requestBody,
      responses: op.responses,
    });
  },
  renderSchema(input: SchemaRenderInput): string {
    const s = input.schema;
    return serialize({
      name: s.name,
      description: s.description,
      type: s.type,
      properties: s.properties,
      required: s.required,
      enum: s.enum,
    });
  },
};
