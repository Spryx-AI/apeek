import { describe, expect, it } from "vitest";
import { resolveSource } from "../../src/core/source-resolver.js";
import { emptyConfig } from "../../src/config/schema.js";
import { SourceError } from "../../src/lib/errors.js";

describe("resolveSource — ad-hoc URL flag", () => {
  it("treats an https URL as a URL source, not a path", () => {
    const r = resolveSource({
      sourceFlag: "https://example.com/openapi.json",
      config: emptyConfig(),
    });
    expect(r.descriptor.kind).toBe("url");
    if (r.descriptor.kind === "url") {
      expect(r.descriptor.url).toBe("https://example.com/openapi.json");
    }
  });

  it("rejects http:// without an alias registration", () => {
    expect(() =>
      resolveSource({
        sourceFlag: "http://example.com/openapi.json",
        config: emptyConfig(),
      }),
    ).toThrowError(SourceError);
  });

  it("treats a file:// URL as a URL source", () => {
    const r = resolveSource({
      sourceFlag: "file:///tmp/openapi.json",
      config: emptyConfig(),
    });
    expect(r.descriptor.kind).toBe("url");
  });

  it("still treats a .json filesystem path as a path source", () => {
    expect(() =>
      resolveSource({
        sourceFlag: "/nonexistent/dir/openapi.json",
        config: emptyConfig(),
      }),
    ).toThrowError(SourceError);
    // Error message is about the file not existing (path branch),
    // not about an unknown alias (config lookup branch).
    try {
      resolveSource({
        sourceFlag: "/nonexistent/dir/openapi.json",
        config: emptyConfig(),
      });
    } catch (err) {
      expect((err as SourceError).message).toContain("source file not found");
    }
  });
});
