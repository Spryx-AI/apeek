import type { NormalizedOperation, NormalizedSchema } from "../../types.js";

export interface SourceInfo {
  readonly alias: string | undefined;
  readonly location: string;
}

export interface SearchResultOperation {
  readonly kind: "operation";
  readonly operation: NormalizedOperation;
  readonly score: number;
}

export interface SearchResultSchema {
  readonly kind: "schema";
  readonly schema: NormalizedSchema;
  readonly score: number;
}

export type SearchResultItem = SearchResultOperation | SearchResultSchema;

export interface SearchInput {
  readonly query: string;
  readonly source: SourceInfo;
  readonly results: readonly SearchResultItem[];
}

export interface OpInput {
  readonly source: SourceInfo;
  readonly operation: NormalizedOperation;
}

export interface SchemaRenderInput {
  readonly source: SourceInfo;
  readonly schema: NormalizedSchema;
}

export type OutputFormat = "markdown" | "json" | "compact";

export const VALID_FORMATS: readonly OutputFormat[] = ["markdown", "json", "compact"];

export interface Renderer {
  renderSearch(input: SearchInput): string;
  renderOp(input: OpInput): string;
  renderSchema(input: SchemaRenderInput): string;
}
