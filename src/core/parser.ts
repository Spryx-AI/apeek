import { dereference } from "@readme/openapi-parser";
import { ParseError } from "../lib/errors.js";
import type {
  NormalizedOperation,
  NormalizedSchema,
  NormalizedSpec,
  ParameterInfo,
  RequestBodyInfo,
  ResponseInfo,
  SchemaInfo,
  SecurityRequirement,
} from "../types.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const;
type HttpMethodLower = (typeof HTTP_METHODS)[number];
const PARSE_TIMEOUT_MS = 30_000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function assertOpenApiVersion(data: unknown): void {
  if (!isRecord(data)) {
    throw new ParseError("spec is not an object", {
      hint: "the fetched content did not look like an OpenAPI document",
    });
  }
  if ("swagger" in data) {
    throw new ParseError(`Swagger ${String(data["swagger"])} is not supported`, {
      hint: "apeek supports OpenAPI 3.0.x and 3.1.x only",
    });
  }
  const version = asString(data["openapi"]);
  if (version === undefined) {
    throw new ParseError("missing 'openapi' version field", {
      hint: "the document does not declare an OpenAPI version",
    });
  }
  if (!/^3\.(0|1)(\.|$)/.test(version)) {
    throw new ParseError(`unsupported OpenAPI version: ${version}`, {
      hint: "apeek supports OpenAPI 3.0.x and 3.1.x only",
    });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ParseError(`${label} exceeded ${ms / 1000}s timeout`, {
          hint: "the spec may be very large or contain cyclic references",
        }),
      );
    }, ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function parseSpec(data: unknown): Promise<NormalizedSpec> {
  assertOpenApiVersion(data);
  let dereferenced: UnknownRecord;
  try {
    dereferenced = (await withTimeout(
      dereference(data as Parameters<typeof dereference>[0], {}),
      PARSE_TIMEOUT_MS,
      "spec parse",
    )) as UnknownRecord;
  } catch (err) {
    if (err instanceof ParseError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ParseError(`failed to parse OpenAPI spec: ${message}`, {
      hint: "check the spec for unresolvable $ref pointers or invalid structure",
      cause: err,
    });
  }
  return normalize(dereferenced);
}

function normalize(doc: UnknownRecord): NormalizedSpec {
  const info = isRecord(doc["info"]) ? doc["info"] : undefined;
  const paths = isRecord(doc["paths"]) ? doc["paths"] : {};
  const components = isRecord(doc["components"]) ? doc["components"] : {};
  const schemasNode = isRecord(components["schemas"]) ? components["schemas"] : {};
  const securityNode = Array.isArray(doc["security"]) ? doc["security"] : [];
  const tagsNode = Array.isArray(doc["tags"]) ? doc["tags"] : [];

  // Build a reverse map from dereferenced schema objects to their component
  // names. Since @readme/openapi-parser dereferences by reference, the same
  // object we see at components.schemas.Foo is the one appearing at every
  // $ref target. This lets us recover 'Foo' on request bodies, responses,
  // and parameters even though the raw $ref string was consumed.
  const schemaNames = new WeakMap<object, string>();
  for (const [name, schema] of Object.entries(schemasNode)) {
    if (isRecord(schema)) schemaNames.set(schema, name);
  }

  const operations: NormalizedOperation[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    const sharedParams = parseParameters(pathItem["parameters"], schemaNames);
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!isRecord(op)) continue;
      operations.push(
        buildOperation(
          method,
          path,
          op,
          sharedParams,
          asSecurity(securityNode),
          schemaNames,
        ),
      );
    }
  }

  const schemas: Record<string, NormalizedSchema> = {};
  for (const [name, schema] of Object.entries(schemasNode)) {
    if (!isRecord(schema)) continue;
    schemas[name] = { ...toSchemaInfo(schema, new Set(), schemaNames), name };
  }

  const tags: Record<string, string | undefined> = {};
  for (const tag of tagsNode) {
    if (!isRecord(tag)) continue;
    const name = asString(tag["name"]);
    if (name === undefined) continue;
    tags[name] = asString(tag["description"]);
  }

  const result: NormalizedSpec = {
    openapi: asString(doc["openapi"]) ?? "3.0.0",
    operations,
    schemas,
    tags,
    ...(info !== undefined
      ? {
          ...(asString(info["title"]) !== undefined ? { title: asString(info["title"])! } : {}),
          ...(asString(info["version"]) !== undefined
            ? { apiVersion: asString(info["version"])! }
            : {}),
        }
      : {}),
  };
  return result;
}

function buildOperation(
  method: HttpMethodLower,
  path: string,
  op: UnknownRecord,
  sharedParams: readonly ParameterInfo[],
  globalSecurity: readonly SecurityRequirement[],
  schemaNames: WeakMap<object, string>,
): NormalizedOperation {
  const localParams = parseParameters(op["parameters"], schemaNames);
  const mergedParams = mergeParameters(sharedParams, localParams);
  const responses = parseResponses(op["responses"], schemaNames);
  const security = Array.isArray(op["security"])
    ? asSecurity(op["security"])
    : globalSecurity;
  const body = parseRequestBody(op["requestBody"], schemaNames);

  const result: NormalizedOperation = {
    method: method.toUpperCase() as NormalizedOperation["method"],
    path,
    tags: asStringArray(op["tags"]),
    parameters: mergedParams,
    responses,
    security,
    ...(asString(op["operationId"]) !== undefined
      ? { operationId: asString(op["operationId"])! }
      : {}),
    ...(asString(op["summary"]) !== undefined ? { summary: asString(op["summary"])! } : {}),
    ...(asString(op["description"]) !== undefined
      ? { description: asString(op["description"])! }
      : {}),
    ...(body !== undefined ? { requestBody: body } : {}),
  };
  return result;
}

function parseParameters(
  node: unknown,
  schemaNames: WeakMap<object, string>,
): ParameterInfo[] {
  if (!Array.isArray(node)) return [];
  const out: ParameterInfo[] = [];
  for (const entry of node) {
    if (!isRecord(entry)) continue;
    const name = asString(entry["name"]);
    const loc = asString(entry["in"]);
    if (name === undefined || loc === undefined) continue;
    if (!["query", "header", "path", "cookie"].includes(loc)) continue;
    const schema = isRecord(entry["schema"])
      ? toSchemaInfo(entry["schema"], new Set(), schemaNames)
      : undefined;
    const param: ParameterInfo = {
      name,
      in: loc as ParameterInfo["in"],
      required: entry["required"] === true || loc === "path",
      ...(asString(entry["description"]) !== undefined
        ? { description: asString(entry["description"])! }
        : {}),
      ...(schema !== undefined ? { schema } : {}),
    };
    out.push(param);
  }
  return out;
}

function mergeParameters(
  shared: readonly ParameterInfo[],
  local: readonly ParameterInfo[],
): ParameterInfo[] {
  const keyed = new Map<string, ParameterInfo>();
  for (const p of shared) keyed.set(`${p.in}:${p.name}`, p);
  for (const p of local) keyed.set(`${p.in}:${p.name}`, p);
  return Array.from(keyed.values());
}

function parseRequestBody(
  node: unknown,
  schemaNames: WeakMap<object, string>,
): RequestBodyInfo | undefined {
  if (!isRecord(node)) return undefined;
  const content = isRecord(node["content"]) ? node["content"] : undefined;
  if (content === undefined) return undefined;
  const [mediaType, mediaNode] = Object.entries(content)[0] ?? [];
  if (mediaType === undefined || !isRecord(mediaNode)) return undefined;
  const schema = isRecord(mediaNode["schema"])
    ? toSchemaInfo(mediaNode["schema"], new Set(), schemaNames)
    : undefined;
  const body: RequestBodyInfo = {
    required: node["required"] === true,
    mediaType,
    ...(schema !== undefined ? { schema } : {}),
    ...(mediaNode["example"] !== undefined ? { example: mediaNode["example"] } : {}),
  };
  return body;
}

function parseResponses(
  node: unknown,
  schemaNames: WeakMap<object, string>,
): ResponseInfo[] {
  if (!isRecord(node)) return [];
  const out: ResponseInfo[] = [];
  for (const [status, value] of Object.entries(node)) {
    if (!isRecord(value)) continue;
    let schema: SchemaInfo | undefined;
    const content = isRecord(value["content"]) ? value["content"] : undefined;
    if (content !== undefined) {
      const firstMedia = Object.values(content)[0];
      if (isRecord(firstMedia) && isRecord(firstMedia["schema"])) {
        schema = toSchemaInfo(firstMedia["schema"], new Set(), schemaNames);
      }
    }
    const entry: ResponseInfo = {
      status,
      ...(asString(value["description"]) !== undefined
        ? { description: asString(value["description"])! }
        : {}),
      ...(schema !== undefined ? { schema } : {}),
    };
    out.push(entry);
  }
  return out;
}

function asSecurity(node: unknown): SecurityRequirement[] {
  if (!Array.isArray(node)) return [];
  const out: SecurityRequirement[] = [];
  for (const entry of node) {
    if (!isRecord(entry)) continue;
    for (const [scheme, scopes] of Object.entries(entry)) {
      out.push({ scheme, scopes: asStringArray(scopes) });
    }
  }
  return out;
}

function toSchemaInfo(
  node: UnknownRecord,
  ancestors: Set<object>,
  schemaNames: WeakMap<object, string>,
): SchemaInfo {
  if (ancestors.has(node)) {
    // On cyclic re-entry, surface the component name if we know it so the
    // agent can jump to 'apeek schema <name>' rather than staring at a dead
    // '[cyclic reference]' marker.
    const cyclicName = schemaNames.get(node);
    if (cyclicName !== undefined) {
      return { name: cyclicName, description: `[cyclic reference — see schema ${cyclicName}]` };
    }
    return { description: "[cyclic reference]" };
  }
  ancestors.add(node);
  try {
    const name = schemaNames.get(node);
    const type = asString(node["type"]);
    const format = asString(node["format"]);
    const description = asString(node["description"]);
    const nullable = node["nullable"] === true ? true : undefined;
    const enumValues = Array.isArray(node["enum"])
      ? (node["enum"].filter(
          (v): v is string | number | boolean | null =>
            v === null ||
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean",
        ) as readonly (string | number | boolean | null)[])
      : undefined;
    const required = asStringArray(node["required"]);
    const properties = isRecord(node["properties"])
      ? toProperties(node["properties"], ancestors, schemaNames)
      : undefined;
    const items = isRecord(node["items"])
      ? toSchemaInfo(node["items"], ancestors, schemaNames)
      : undefined;
    const oneOf = readVariants(node["oneOf"], ancestors, schemaNames);
    const anyOf = readVariants(node["anyOf"], ancestors, schemaNames);
    const allOf = readVariants(node["allOf"], ancestors, schemaNames);

    const result: SchemaInfo = {
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(format !== undefined ? { format } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(enumValues !== undefined && enumValues.length > 0 ? { enum: enumValues } : {}),
      ...(required.length > 0 ? { required } : {}),
      ...(properties !== undefined ? { properties } : {}),
      ...(items !== undefined ? { items } : {}),
      ...(nullable !== undefined ? { nullable } : {}),
      ...(oneOf !== undefined ? { oneOf } : {}),
      ...(anyOf !== undefined ? { anyOf } : {}),
      ...(allOf !== undefined ? { allOf } : {}),
    };
    return result;
  } finally {
    ancestors.delete(node);
  }
}

function readVariants(
  value: unknown,
  ancestors: Set<object>,
  schemaNames: WeakMap<object, string>,
): readonly SchemaInfo[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: SchemaInfo[] = [];
  for (const v of value) {
    if (isRecord(v)) out.push(toSchemaInfo(v, ancestors, schemaNames));
  }
  return out.length > 0 ? out : undefined;
}

function toProperties(
  node: UnknownRecord,
  ancestors: Set<object>,
  schemaNames: WeakMap<object, string>,
): Record<string, SchemaInfo> {
  const out: Record<string, SchemaInfo> = {};
  for (const [name, value] of Object.entries(node)) {
    if (!isRecord(value)) continue;
    out[name] = toSchemaInfo(value, ancestors, schemaNames);
  }
  return out;
}
