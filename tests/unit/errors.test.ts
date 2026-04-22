import { describe, expect, it } from "vitest";
import {
  ApeekError,
  ConfigError,
  SourceError,
  FetchError,
  ParseError,
  CacheError,
  AgentInstallError,
  MissingEnvError,
  NotFoundError,
} from "../../src/lib/errors.js";

describe("ApeekError hierarchy", () => {
  it("maps each subclass to its documented exit code", () => {
    expect(new ConfigError("x").exitCode).toBe(2);
    expect(new SourceError("x").exitCode).toBe(1);
    expect(new FetchError("x").exitCode).toBe(3);
    expect(new ParseError("x").exitCode).toBe(2);
    expect(new CacheError("x").exitCode).toBe(2);
    expect(new AgentInstallError("x").exitCode).toBe(1);
    expect(new MissingEnvError("X").exitCode).toBe(2);
    expect(new NotFoundError("x").exitCode).toBe(1);
  });

  it("carries a stable code string per subclass", () => {
    expect(new ConfigError("x").code).toBe("E_CONFIG");
    expect(new SourceError("x").code).toBe("E_SOURCE");
    expect(new FetchError("x").code).toBe("E_FETCH");
    expect(new ParseError("x").code).toBe("E_PARSE");
    expect(new CacheError("x").code).toBe("E_CACHE");
    expect(new AgentInstallError("x").code).toBe("E_AGENT_INSTALL");
    expect(new MissingEnvError("X").code).toBe("E_MISSING_ENV");
    expect(new NotFoundError("x").code).toBe("E_NOT_FOUND");
  });

  it("stores hint when provided", () => {
    const err = new ConfigError("bad", { hint: "try harder" });
    expect(err.hint).toBe("try harder");
  });

  it("omits hint when not provided", () => {
    expect(new ConfigError("bad").hint).toBeUndefined();
  });

  it("MissingEnvError names the variable and includes fallback hint", () => {
    const err = new MissingEnvError("MY_TOKEN");
    expect(err.message).toContain("MY_TOKEN");
    expect(err.hint).toContain("MY_TOKEN");
    expect(err.hint).toContain(":-default");
  });

  it("all subclasses are instances of ApeekError and Error", () => {
    const err = new SourceError("x");
    expect(err).toBeInstanceOf(ApeekError);
    expect(err).toBeInstanceOf(Error);
  });

  it("forwards cause to Error", () => {
    const cause = new Error("root");
    const err = new FetchError("wrapped", { cause });
    expect(err.cause).toBe(cause);
  });
});
