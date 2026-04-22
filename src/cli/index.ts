import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as {
  version: string;
};

const program = new Command();

program
  .name("apeek")
  .description("OpenAPI context lookup CLI for AI coding agents")
  .version(pkg.version, "-V, --version", "print version and exit");

program
  .command("version")
  .description("print version")
  .action(() => {
    process.stdout.write(`${pkg.version}\n`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(99);
});
