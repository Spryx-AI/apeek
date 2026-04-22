export interface UrlSourceDescriptor {
  readonly kind: "url";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly allowInsecure?: boolean;
  readonly cacheTtlSeconds?: number;
}

export interface PathSourceDescriptor {
  readonly kind: "path";
  readonly path: string;
  readonly cacheTtlSeconds?: number;
}

export type SourceDescriptor = UrlSourceDescriptor | PathSourceDescriptor;

export interface ParameterInfo {
  readonly name: string;
  readonly in: "query" | "header" | "path" | "cookie";
  readonly required: boolean;
  readonly description?: string;
  readonly schema?: SchemaInfo;
}

export interface SchemaInfo {
  readonly name?: string;
  readonly type?: string;
  readonly format?: string;
  readonly description?: string;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, SchemaInfo>>;
  readonly items?: SchemaInfo;
  readonly nullable?: boolean;
}

export interface RequestBodyInfo {
  readonly required: boolean;
  readonly mediaType: string;
  readonly schema?: SchemaInfo;
  readonly example?: unknown;
}

export interface ResponseInfo {
  readonly status: string;
  readonly description?: string;
  readonly schema?: SchemaInfo;
}

export interface SecurityRequirement {
  readonly scheme: string;
  readonly scopes: readonly string[];
}

export interface NormalizedOperation {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE";
  readonly path: string;
  readonly operationId?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly parameters: readonly ParameterInfo[];
  readonly requestBody?: RequestBodyInfo;
  readonly responses: readonly ResponseInfo[];
  readonly security: readonly SecurityRequirement[];
}

export interface NormalizedSchema extends SchemaInfo {
  readonly name: string;
}

export interface NormalizedSpec {
  readonly openapi: string;
  readonly title?: string;
  readonly apiVersion?: string;
  readonly operations: readonly NormalizedOperation[];
  readonly schemas: Readonly<Record<string, NormalizedSchema>>;
  readonly tags: Readonly<Record<string, string | undefined>>;
}

export type FetchResult =
  | {
      readonly kind: "fresh";
      readonly data: unknown;
      readonly etag?: string;
      readonly lastModified?: string;
    }
  | { readonly kind: "not-modified" };

export interface ConditionalFetch {
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface CacheMeta {
  readonly fetchedAt: number;
  readonly ttlSeconds: number | null;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly specHash: string;
  readonly cacheSchemaVersion: number;
  readonly nodeMajor: number;
}

export interface SerializedIndex {
  readonly operations: string;
  readonly schemas: string;
}
