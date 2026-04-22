import { Command } from "commander";
import { selectRenderer } from "../../core/formatter/index.js";
import { NotFoundError } from "../../lib/errors.js";
import { stdoutRaw } from "../output.js";
import { effectiveFormat, prepareQuery } from "../command-context.js";

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(
        dp[j]! + 1,
        dp[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n]!;
}

function closeMatches(target: string, names: readonly string[]): string[] {
  const scored = names
    .map((name) => ({ name, distance: levenshtein(target.toLowerCase(), name.toLowerCase()) }))
    .filter(({ distance, name }) => distance <= Math.max(2, Math.floor(name.length / 3)))
    .sort((a, b) => a.distance - b.distance);
  return scored.slice(0, 3).map((entry) => entry.name);
}

export function buildSchemaCommand(): Command {
  return new Command("schema")
    .description("show full definition for one component schema")
    .argument("<name>", "schema name (case-sensitive)")
    .action(async (name: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals<{
        source?: string;
        format?: string;
        refresh?: boolean;
      }>();
      const format = effectiveFormat(globals.format);
      const { resolved, loaded } = await prepareQuery(globals);
      const direct = loaded.spec.schemas[name];
      if (direct === undefined) {
        const near = closeMatches(name, Object.keys(loaded.spec.schemas));
        throw new NotFoundError(`no schema named ${name}`, {
          hint:
            near.length > 0
              ? `did you mean: ${near.join(", ")}?`
              : "use 'apeek search' to discover available schemas",
        });
      }
      const renderer = selectRenderer(format);
      stdoutRaw(renderer.renderSchema({ source: resolved.display, schema: direct }));
    });
}
