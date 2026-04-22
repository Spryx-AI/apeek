import { describe, expect, it } from "vitest";
import { interpolate, interpolateHeaders } from "../../src/lib/env.js";
import { MissingEnvError } from "../../src/lib/errors.js";

describe("interpolate", () => {
  it("substitutes a defined variable", () => {
    const env = { TOKEN: "abc" };
    expect(interpolate("Bearer ${TOKEN}", env)).toBe("Bearer abc");
  });

  it("substitutes multiple variables in one string", () => {
    const env = { A: "1", B: "2" };
    expect(interpolate("${A}/${B}", env)).toBe("1/2");
  });

  it("raises MissingEnvError when variable is unset and no default", () => {
    expect(() => interpolate("Bearer ${TOKEN}", {})).toThrowError(MissingEnvError);
  });

  it("raises MissingEnvError when variable is empty string and no default", () => {
    expect(() => interpolate("Bearer ${TOKEN}", { TOKEN: "" })).toThrowError(MissingEnvError);
  });

  it("uses default when variable is unset", () => {
    expect(interpolate("${LIMIT:-5}", {})).toBe("5");
  });

  it("uses default when variable is empty string", () => {
    expect(interpolate("${LIMIT:-5}", { LIMIT: "" })).toBe("5");
  });

  it("prefers defined variable over default", () => {
    expect(interpolate("${LIMIT:-5}", { LIMIT: "10" })).toBe("10");
  });

  it("passes strings with no placeholders through unchanged", () => {
    expect(interpolate("plain text", {})).toBe("plain text");
  });

  it("supports lowercase and mixed-case variable names", () => {
    expect(interpolate("${my_var}-${MixedCase}", { my_var: "a", MixedCase: "b" })).toBe("a-b");
  });

  it("does not persist env values anywhere (pure function)", () => {
    const env = { TOKEN: "secret" };
    const result = interpolate("${TOKEN}", env);
    expect(result).toBe("secret");
    // verify no mutation of input
    expect(env).toEqual({ TOKEN: "secret" });
  });
});

describe("interpolateHeaders", () => {
  it("resolves each header value", () => {
    const env = { TOKEN: "abc" };
    const out = interpolateHeaders(
      { Authorization: "Bearer ${TOKEN}", Accept: "application/json" },
      env,
    );
    expect(out).toEqual({ Authorization: "Bearer abc", Accept: "application/json" });
  });

  it("raises MissingEnvError when any header value references an unset variable", () => {
    expect(() =>
      interpolateHeaders({ Authorization: "Bearer ${MISSING_TOKEN}" }, {}),
    ).toThrowError(MissingEnvError);
  });
});
