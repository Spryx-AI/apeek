import MiniSearch from "minisearch";
import type {
  NormalizedOperation,
  NormalizedSpec,
  ParameterInfo,
  SchemaInfo,
  SerializedIndex,
} from "../types.js";

const OPERATION_FIELDS = [
  "operationId",
  "summary",
  "description",
  "method",
  "pathSegments",
  "tags",
  "parametersText",
  "requestBodySchema",
] as const;

const OPERATION_BOOSTS: Readonly<Record<(typeof OPERATION_FIELDS)[number], number>> = {
  operationId: 3,
  summary: 3,
  description: 1.5,
  method: 1.5,
  pathSegments: 1.5,
  tags: 1.5,
  parametersText: 0.5,
  requestBodySchema: 0.5,
};

const SCHEMA_FIELDS = ["name", "description", "propertyNames"] as const;

const SCHEMA_BOOSTS: Readonly<Record<(typeof SCHEMA_FIELDS)[number], number>> = {
  name: 3,
  description: 1.5,
  propertyNames: 0.5,
};

interface OperationDoc {
  id: string;
  operationId: string;
  summary: string;
  description: string;
  method: string;
  pathSegments: string;
  tags: string;
  parametersText: string;
  requestBodySchema: string;
}

interface SchemaDoc {
  id: string;
  name: string;
  description: string;
  propertyNames: string;
}

export interface OperationHit {
  readonly kind: "operation";
  readonly id: string;
  readonly score: number;
}

export interface SchemaHit {
  readonly kind: "schema";
  readonly id: string;
  readonly score: number;
}

export type SearchHit = OperationHit | SchemaHit;

function tokenizePath(path: string): string {
  return path
    .split(/[\/{}]+/)
    .filter((seg) => seg.length > 0)
    .join(" ");
}

function parametersText(params: readonly ParameterInfo[]): string {
  return params
    .map((p) => `${p.name} ${p.description ?? ""}`.trim())
    .join(" ");
}

function requestBodySchemaRef(op: NormalizedOperation): string {
  const schemaType = op.requestBody?.schema?.type ?? "";
  return schemaType;
}

function operationKey(op: NormalizedOperation): string {
  return `${op.method} ${op.path}`;
}

function toOperationDoc(op: NormalizedOperation): OperationDoc {
  return {
    id: operationKey(op),
    operationId: op.operationId ?? "",
    summary: op.summary ?? "",
    description: op.description ?? "",
    method: op.method,
    pathSegments: tokenizePath(op.path),
    tags: op.tags.join(" "),
    parametersText: parametersText(op.parameters),
    requestBodySchema: requestBodySchemaRef(op),
  };
}

function propertyNamesOf(schema: SchemaInfo): string {
  const names = schema.properties !== undefined ? Object.keys(schema.properties) : [];
  return names.join(" ");
}

function toSchemaDoc(name: string, schema: SchemaInfo): SchemaDoc {
  return {
    id: name,
    name,
    description: schema.description ?? "",
    propertyNames: propertyNamesOf(schema),
  };
}

function buildOperationIndex(spec: NormalizedSpec): MiniSearch<OperationDoc> {
  const index = new MiniSearch<OperationDoc>({
    fields: [...OPERATION_FIELDS],
    storeFields: ["id"],
    searchOptions: {
      boost: OPERATION_BOOSTS,
      combineWith: "AND",
      prefix: true,
      fuzzy: 0.2,
    },
  });
  index.addAll(spec.operations.map(toOperationDoc));
  return index;
}

function buildSchemaIndex(spec: NormalizedSpec): MiniSearch<SchemaDoc> {
  const index = new MiniSearch<SchemaDoc>({
    fields: [...SCHEMA_FIELDS],
    storeFields: ["id"],
    searchOptions: {
      boost: SCHEMA_BOOSTS,
      combineWith: "AND",
      prefix: true,
      fuzzy: 0.2,
    },
  });
  index.addAll(Object.entries(spec.schemas).map(([name, schema]) => toSchemaDoc(name, schema)));
  return index;
}

export function buildIndex(spec: NormalizedSpec): SerializedIndex {
  const ops = buildOperationIndex(spec);
  const schemas = buildSchemaIndex(spec);
  return {
    operations: JSON.stringify(ops.toJSON()),
    schemas: JSON.stringify(schemas.toJSON()),
  };
}

function loadOperationIndex(serialized: string): MiniSearch<OperationDoc> {
  return MiniSearch.loadJSON(serialized, {
    fields: [...OPERATION_FIELDS],
    storeFields: ["id"],
  });
}

function loadSchemaIndex(serialized: string): MiniSearch<SchemaDoc> {
  return MiniSearch.loadJSON(serialized, {
    fields: [...SCHEMA_FIELDS],
    storeFields: ["id"],
  });
}

export function search(
  serialized: SerializedIndex,
  query: string,
  opts: { limit: number },
): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const ops = loadOperationIndex(serialized.operations);
  const schemas = loadSchemaIndex(serialized.schemas);
  const opResults = ops.search(trimmed, { boost: OPERATION_BOOSTS });
  const schemaResults = schemas.search(trimmed, { boost: SCHEMA_BOOSTS });
  const all: SearchHit[] = [
    ...opResults.map(
      (r): OperationHit => ({ kind: "operation", id: String(r["id"]), score: r.score }),
    ),
    ...schemaResults.map(
      (r): SchemaHit => ({ kind: "schema", id: String(r["id"]), score: r.score }),
    ),
  ];
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, opts.limit);
}
