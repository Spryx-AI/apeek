import { Command } from "commander";
import { search as searchIndex, type SearchHit } from "../../core/indexer.js";
import { selectRenderer } from "../../core/formatter/index.js";
import { stdoutRaw } from "../output.js";
import { effectiveFormat, effectiveLimit, prepareQuery } from "../command-context.js";
import type { NormalizedOperation, NormalizedSchema } from "../../types.js";
import type { SearchResultItem } from "../../core/formatter/types.js";

export function buildSearchCommand(): Command {
  return new Command("search")
    .description("find operations and schemas in the active source")
    .argument("<query>", "natural-language query")
    .action(async (query: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals<{
        source?: string;
        format?: string;
        limit?: number;
        refresh?: boolean;
      }>();
      const format = effectiveFormat(globals.format);
      const limit = effectiveLimit(globals.limit);
      const { resolved, loaded } = await prepareQuery(globals);
      const hits = searchIndex(loaded.index, query, { limit });

      const opsByKey = new Map<string, NormalizedOperation>();
      for (const op of loaded.spec.operations) opsByKey.set(`${op.method} ${op.path}`, op);
      const schemasByName = new Map<string, NormalizedSchema>(
        Object.entries(loaded.spec.schemas),
      );

      const results: SearchResultItem[] = hits.flatMap((hit) => expand(hit, opsByKey, schemasByName));
      const renderer = selectRenderer(format);
      stdoutRaw(
        renderer.renderSearch({
          query,
          source: resolved.display,
          results,
        }),
      );
    });
}

function expand(
  hit: SearchHit,
  opsByKey: Map<string, NormalizedOperation>,
  schemasByName: Map<string, NormalizedSchema>,
): SearchResultItem[] {
  if (hit.kind === "operation") {
    const op = opsByKey.get(hit.id);
    if (op === undefined) return [];
    return [{ kind: "operation", operation: op, score: hit.score }];
  }
  const schema = schemasByName.get(hit.id);
  if (schema === undefined) return [];
  return [{ kind: "schema", schema, score: hit.score }];
}
