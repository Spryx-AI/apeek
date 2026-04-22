import kleur from "kleur";

interface OutputConfig {
  noColor: boolean;
  verbose: boolean;
}

const state: OutputConfig = {
  noColor: false,
  verbose: false,
};

export function configureOutput(opts: Partial<OutputConfig>): void {
  if (opts.noColor !== undefined) state.noColor = opts.noColor;
  if (opts.verbose !== undefined) state.verbose = opts.verbose;
}

export function isVerbose(): boolean {
  return state.verbose;
}

function colorEnabled(stream: NodeJS.WriteStream): boolean {
  if (state.noColor) return false;
  if (process.env["NO_COLOR"] !== undefined && process.env["NO_COLOR"] !== "") return false;
  return Boolean(stream.isTTY);
}

function paint(
  stream: NodeJS.WriteStream,
  text: string,
  style?: (s: string) => string,
): string {
  if (style === undefined || !colorEnabled(stream)) return text;
  kleur.enabled = true;
  const painted = style(text);
  kleur.enabled = false;
  return painted;
}

export function stdout(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

export function stdoutRaw(text: string): void {
  process.stdout.write(text);
}

export function stderr(text: string): void {
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
}

export function info(text: string): void {
  stderr(text);
}

export function warn(text: string): void {
  const painted = paint(process.stderr, `warning: ${text}`, kleur.yellow);
  stderr(painted);
}

export function error(text: string): void {
  const painted = paint(process.stderr, `error: ${text}`, kleur.red);
  stderr(painted);
}

export function debug(text: string): void {
  if (!state.verbose) return;
  const painted = paint(process.stderr, `debug: ${text}`, kleur.gray);
  stderr(painted);
}
