import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ApeekError } from "../lib/errors.js";
import { configureOutput, error as errOut, stderr, stdout } from "./output.js";

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

const program = new Command();

program
  .name("apeek")
  .description("OpenAPI context lookup CLI for AI coding agents")
  .version(pkg.version, "-V, --version", "print version and exit")
  .option("--no-color", "disable ANSI color")
  .option("-v, --verbose", "emit debug logging to stderr", false)
  .hook("preAction", (thisCmd) => {
    const opts = thisCmd.opts<{ color?: boolean; verbose?: boolean }>();
    configureOutput({
      noColor: opts.color === false,
      verbose: opts.verbose === true,
    });
  });

program
  .command("version")
  .description("print version")
  .action(() => {
    stdout(pkg.version);
  });

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

program.parseAsync(process.argv).catch(reportError);
