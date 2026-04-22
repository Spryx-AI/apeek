import { MissingEnvError } from "./errors.js";

const INTERPOLATION_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

export function interpolate(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return value.replace(INTERPOLATION_RE, (_match, name: string, fallback?: string) => {
    const resolved = env[name];
    if (resolved !== undefined && resolved !== "") return resolved;
    if (fallback !== undefined) return fallback;
    throw new MissingEnvError(name);
  });
}

export function interpolateHeaders(
  headers: Readonly<Record<string, string>>,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = interpolate(value, env);
  }
  return out;
}
