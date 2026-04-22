import type { OpInput, Renderer, SchemaRenderInput, SearchInput } from "./types.js";

export const compactRenderer: Renderer = {
  renderSearch(input: SearchInput): string {
    return (
      input.results
        .map((r) => {
          if (r.kind === "operation") {
            const summary = r.operation.summary ?? "";
            return `${r.operation.method} ${r.operation.path}${summary !== "" ? ` — ${summary}` : ""}`;
          }
          const desc = r.schema.description ?? "";
          return `schema ${r.schema.name}${desc !== "" ? ` — ${desc}` : ""}`;
        })
        .join("\n") + "\n"
    );
  },
  renderOp(input: OpInput): string {
    const op = input.operation;
    const summary = op.summary ?? "";
    return `${op.method} ${op.path}${summary !== "" ? ` — ${summary}` : ""}\n`;
  },
  renderSchema(input: SchemaRenderInput): string {
    const s = input.schema;
    const desc = s.description ?? "";
    return `schema ${s.name}${desc !== "" ? ` — ${desc}` : ""}\n`;
  },
};
