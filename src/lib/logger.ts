import { debug, info, warn, error } from "../cli/output.js";
import { redactHeaders } from "./redact.js";

export const logger = {
  debug,
  info,
  warn,
  error,
  debugHeaders(prefix: string, headers: Readonly<Record<string, string>>): void {
    debug(`${prefix}: ${JSON.stringify(redactHeaders(headers))}`);
  },
};
