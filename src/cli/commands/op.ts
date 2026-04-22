import { Command } from "commander";
import { selectRenderer } from "../../core/formatter/index.js";
import { NotFoundError } from "../../lib/errors.js";
import { stdoutRaw } from "../output.js";
import { effectiveFormat, prepareQuery } from "../command-context.js";

const VALID_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"];

export function buildOpCommand(): Command {
  return new Command("op")
    .description("show full details for one operation")
    .argument("<method>", "HTTP method (case-insensitive)")
    .argument("<path>", "operation path template, e.g. /deals or /deals/{deal_id}")
    .action(async (method: string, path: string, _opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals<{
        source?: string;
        format?: string;
        refresh?: boolean;
      }>();
      const format = effectiveFormat(globals.format);
      const normalizedMethod = method.toUpperCase();
      if (!VALID_METHODS.includes(normalizedMethod)) {
        throw new NotFoundError(`unknown HTTP method: ${method}`, {
          hint: `valid methods: ${VALID_METHODS.join(", ")}`,
        });
      }
      const { resolved, loaded } = await prepareQuery(globals);
      const op = loaded.spec.operations.find(
        (o) => o.method === normalizedMethod && o.path === path,
      );
      if (op === undefined) {
        throw new NotFoundError(`no operation matches ${normalizedMethod} ${path}`, {
          hint: "use 'apeek search' to discover related operations",
        });
      }
      const renderer = selectRenderer(format);
      stdoutRaw(renderer.renderOp({ source: resolved.display, operation: op }));
    });
}
