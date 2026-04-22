import { SourceError } from "../../lib/errors.js";
import { compactRenderer } from "./compact.js";
import { jsonRenderer } from "./json.js";
import { markdownRenderer } from "./markdown.js";
import type { OutputFormat, Renderer } from "./types.js";
import { VALID_FORMATS } from "./types.js";

export function selectRenderer(format: string): Renderer {
  const key = format as OutputFormat;
  if (!VALID_FORMATS.includes(key)) {
    throw new SourceError(`unknown format '${format}'`, {
      hint: `valid formats: ${VALID_FORMATS.join(", ")}`,
    });
  }
  switch (key) {
    case "markdown":
      return markdownRenderer;
    case "json":
      return jsonRenderer;
    case "compact":
      return compactRenderer;
  }
}

export { markdownRenderer, jsonRenderer, compactRenderer };
export type {
  OpInput,
  OutputFormat,
  Renderer,
  SchemaRenderInput,
  SearchInput,
  SearchResultItem,
  SourceInfo,
} from "./types.js";
