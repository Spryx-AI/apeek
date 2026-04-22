export abstract class ApeekError extends Error {
  abstract readonly code: string;
  abstract readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, options?: { hint?: string; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    if (options?.hint !== undefined) {
      this.hint = options.hint;
    }
  }
}

export class ConfigError extends ApeekError {
  readonly code = "E_CONFIG";
  readonly exitCode = 2;
}

export class SourceError extends ApeekError {
  readonly code = "E_SOURCE";
  readonly exitCode = 1;
}

export class FetchError extends ApeekError {
  readonly code = "E_FETCH";
  readonly exitCode = 3;
}

export class ParseError extends ApeekError {
  readonly code = "E_PARSE";
  readonly exitCode = 2;
}

export class CacheError extends ApeekError {
  readonly code = "E_CACHE";
  readonly exitCode = 2;
}

export class AgentInstallError extends ApeekError {
  readonly code = "E_AGENT_INSTALL";
  readonly exitCode = 1;
}

export class MissingEnvError extends ApeekError {
  readonly code = "E_MISSING_ENV";
  readonly exitCode = 2;

  constructor(variable: string) {
    super(`environment variable '${variable}' is not set`, {
      hint: `set ${variable} in your environment, or use '\${${variable}:-default}' syntax`,
    });
  }
}

export class NotFoundError extends ApeekError {
  readonly code = "E_NOT_FOUND";
  readonly exitCode = 1;
}
