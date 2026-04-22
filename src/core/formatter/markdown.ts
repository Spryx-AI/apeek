import type {
  NormalizedOperation,
  NormalizedSchema,
  ParameterInfo,
  RequestBodyInfo,
  ResponseInfo,
  SchemaInfo,
  SecurityRequirement,
} from "../../types.js";
import type {
  OpInput,
  Renderer,
  SchemaRenderInput,
  SearchInput,
  SearchResultItem,
} from "./types.js";

function sourceLine(source: SearchInput["source"]): string {
  if (source.alias !== undefined) return `Source: ${source.alias} (${source.location})`;
  return `Source: ${source.location}`;
}

function authLine(security: readonly SecurityRequirement[]): string {
  if (security.length === 0) return "none";
  return security
    .map((s) => (s.scopes.length > 0 ? `${s.scheme} (${s.scopes.join(", ")})` : s.scheme))
    .join(", ");
}

function tagsLine(tags: readonly string[]): string {
  return tags.length > 0 ? tags.join(", ") : "—";
}

function schemaTypeLabel(schema: SchemaInfo | undefined): string {
  if (schema === undefined) return "";
  if (schema.type !== undefined && schema.format !== undefined) {
    return `${schema.type} (${schema.format})`;
  }
  return schema.type ?? "";
}

function schemaDescription(schema: SchemaInfo | undefined): string {
  if (schema === undefined) return "";
  const parts: string[] = [];
  if (schema.description !== undefined) parts.push(schema.description);
  if (schema.enum !== undefined && schema.enum.length > 0) {
    parts.push(`one of: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  }
  return parts.join(" — ");
}

function renderPropertyTable(schema: SchemaInfo | undefined, indent = ""): string {
  if (schema?.properties === undefined || Object.keys(schema.properties).length === 0) return "";
  const required = new Set(schema.required ?? []);
  const rows = Object.entries(schema.properties).map(([name, prop]) => {
    return `${indent}| ${name} | ${schemaTypeLabel(prop)} | ${required.has(name) ? "yes" : "no"} | ${schemaDescription(prop)} |`;
  });
  return [
    `${indent}| Field | Type | Required | Description |`,
    `${indent}|-------|------|----------|-------------|`,
    ...rows,
  ].join("\n");
}

function renderParameters(params: readonly ParameterInfo[]): string {
  if (params.length === 0) return "";
  const rows = params.map(
    (p) =>
      `| ${p.name} | ${schemaTypeLabel(p.schema)} | ${p.required ? "yes" : "no"} | ${p.description ?? ""} |`,
  );
  return [
    "",
    "## Parameters",
    "",
    "| Name | Type | Required | Description |",
    "|------|------|----------|-------------|",
    ...rows,
  ].join("\n");
}

function renderRequestBody(body: RequestBodyInfo | undefined): string {
  if (body === undefined) return "";
  const out: string[] = ["", `## Request body (${body.mediaType})`, ""];
  if (body.schema !== undefined) {
    const propTable = renderPropertyTable(body.schema);
    if (propTable !== "") out.push(propTable);
    else if (body.schema.type !== undefined) {
      out.push(`Type: \`${schemaTypeLabel(body.schema)}\``);
    }
  }
  return out.join("\n");
}

function renderResponses(responses: readonly ResponseInfo[]): string {
  if (responses.length === 0) return "";
  const rows = responses.map(
    (r) => `- **${r.status}** ${r.schema?.type ?? r.schema?.description ?? ""} — ${r.description ?? ""}`.replace(/\s+$/, ""),
  );
  return ["", "## Responses", "", ...rows].join("\n");
}

function renderExample(operation: NormalizedOperation): string {
  const ex = operation.requestBody?.example;
  if (ex === undefined) return "";
  return ["", "## Example request", "", "```json", JSON.stringify(ex, null, 2), "```"].join("\n");
}

function renderOperation(op: NormalizedOperation): string {
  const header = `# ${op.method} ${op.path}`;
  const lines: string[] = [header, ""];
  if (op.summary !== undefined) lines.push(`**Summary:** ${op.summary}`);
  lines.push(`**Tags:** ${tagsLine(op.tags)}`);
  lines.push(`**Auth:** ${authLine(op.security)}`);
  if (op.description !== undefined) lines.push("", op.description);
  const params = renderParameters(op.parameters);
  if (params !== "") lines.push(params);
  const body = renderRequestBody(op.requestBody);
  if (body !== "") lines.push(body);
  const responses = renderResponses(op.responses);
  if (responses !== "") lines.push(responses);
  const example = renderExample(op);
  if (example !== "") lines.push(example);
  return lines.join("\n") + "\n";
}

function renderSchemaBody(schema: NormalizedSchema): string {
  const lines: string[] = [`# schema ${schema.name}`, ""];
  if (schema.description !== undefined) lines.push(schema.description, "");
  const table = renderPropertyTable(schema);
  if (table !== "") lines.push(table);
  else if (schema.type !== undefined) lines.push(`Type: \`${schemaTypeLabel(schema)}\``);
  return lines.join("\n") + "\n";
}

function renderSearchItem(item: SearchResultItem, index: number): string {
  if (item.kind === "operation") {
    const op = item.operation;
    const heading = `## ${index}. ${op.method} ${op.path}${op.summary !== undefined ? ` — ${op.summary}` : ""}`;
    const lines: string[] = [heading, ""];
    if (op.description !== undefined) lines.push(op.description, "");
    lines.push(`Tags: ${tagsLine(op.tags)}`);
    lines.push(`Auth: ${authLine(op.security)}`);
    lines.push(`Relevance: ${item.score.toFixed(2)}`);
    lines.push("");
    lines.push(`Get details: \`apeek op ${op.method} ${op.path}\``);
    return lines.join("\n");
  }
  const s = item.schema;
  const heading = `## ${index}. schema ${s.name}`;
  const lines: string[] = [heading, ""];
  if (s.description !== undefined) lines.push(s.description, "");
  lines.push(`Relevance: ${item.score.toFixed(2)}`);
  lines.push("");
  lines.push(`Get details: \`apeek schema ${s.name}\``);
  return lines.join("\n");
}

export const markdownRenderer: Renderer = {
  renderSearch(input: SearchInput): string {
    const lines: string[] = [
      `# Search results: "${input.query}"`,
      "",
      sourceLine(input.source),
      `Results: ${input.results.length}`,
      "",
    ];
    input.results.forEach((item, i) => {
      lines.push(renderSearchItem(item, i + 1));
      lines.push("");
    });
    return lines.join("\n").trimEnd() + "\n";
  },
  renderOp(input: OpInput): string {
    return renderOperation(input.operation);
  },
  renderSchema(input: SchemaRenderInput): string {
    return renderSchemaBody(input.schema);
  },
};
