import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ApeekError } from "../lib/errors.js";
import { getGlobalConfigPath } from "../config/paths.js";
import {
  configureOutput,
  error as errOut,
  stderr,
  stdout,
} from "./output.js";
import { buildSearchCommand } from "./commands/search.js";
import { buildOpCommand } from "./commands/op.js";
import { buildSchemaCommand } from "./commands/schema.js";
import { buildCacheCommand } from "./commands/cache.js";

const MIN_NODE_MAJOR = 20;

function checkNodeVersion(): void {
  const current = process.versions.node;
  const major = Number(current.split(".")[0]);
  if (Number.isFinite(major) && major < MIN_NODE_MAJOR) {
    process.stderr.write(
      `error: apeek requires Node.js ${MIN_NODE_MAJOR} or later (running ${current})\n`,
    );
    process.exit(2);
  }
}

checkNodeVersion();

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as {
  version: string;
};

function printWelcome(): void {
  stderr("Welcome to apeek! This looks like your first run.");
  stderr("");
  stderr("To configure sources and install agent integrations, run:");
  stderr("  apeek setup");
  stderr("");
  stderr("Or add a source directly:");
  stderr("  apeek source add <alias> <url-or-path>");
  stderr("");
  stderr("For help: apeek --help");
}

function isFirstRun(): boolean {
  return !existsSync(getGlobalConfigPath());
}

const program = new Command();

program
  .name("apeek")
  .description("OpenAPI context lookup CLI for AI coding agents")
  .version(pkg.version, "-V, --version", "print version and exit")
  .option("-s, --source <alias>", "source alias or path (overrides default)")
  .option("-f, --format <format>", "output format: markdown (default), json, compact")
  .option("-l, --limit <n>", "max search results", (value: string) => Number.parseInt(value, 10))
  .option("--no-color", "disable ANSI color")
  .option("-v, --verbose", "emit debug logging to stderr", false)
  .option("--refresh", "bypass cache for this call", false)
  .hook("preAction", (thisCmd) => {
    const opts = thisCmd.optsWithGlobals<{
      color?: boolean;
      verbose?: boolean;
      limit?: number;
    }>();
    configureOutput({
      noColor: opts.color === false,
      verbose: opts.verbose === true,
    });
    if (opts.limit !== undefined && (!Number.isFinite(opts.limit) || opts.limit <= 0)) {
      throw new Error("--limit must be a positive integer");
    }
  });

program
  .command("version")
  .description("print version")
  .action(() => {
    stdout(pkg.version);
  });

program.addCommand(buildSearchCommand());
program.addCommand(buildOpCommand());
program.addCommand(buildSchemaCommand());
program.addCommand(buildCacheCommand());

program.showHelpAfterError("(run 'apeek --help' for help)");
program.showSuggestionAfterError(true);

function reportError(err: unknown): never {
  if (err instanceof ApeekError) {
    errOut(`${err.code}: ${err.message}`);
    if (err.hint !== undefined) {
      stderr(`  hint: ${err.hint}`);
    }
    process.exit(err.exitCode);
  }
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  errOut(`unexpected error: ${message}`);
  process.exit(99);
}

async function main(): Promise<void> {
  // First-run welcome: no args, no config file.
  if (process.argv.length <= 2 && isFirstRun()) {
    printWelcome();
    return;
  }
  await program.parseAsync(process.argv);
}

main().catch(reportError);
