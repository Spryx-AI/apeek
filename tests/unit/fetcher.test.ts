import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { fetchSpec } from "../../src/core/fetcher.js";
import { FetchError, MissingEnvError } from "../../src/lib/errors.js";
import type { SourceDescriptor } from "../../src/types.js";

const fixturesDir = join(process.cwd(), "tests", "fixtures");

describe("fetchSpec — local files", () => {
  it("loads a YAML file", async () => {
    const source: SourceDescriptor = { kind: "path", path: join(fixturesDir, "petstore.yaml") };
    const res = await fetchSpec(source);
    expect(res.kind).toBe("fresh");
    if (res.kind === "fresh") {
      expect((res.data as { openapi: string }).openapi).toBe("3.0.3");
    }
  });

  it("loads a JSON file", async () => {
    const source: SourceDescriptor = { kind: "path", path: join(fixturesDir, "spryx-sample.json") };
    const res = await fetchSpec(source);
    expect(res.kind).toBe("fresh");
    if (res.kind === "fresh") {
      expect((res.data as { openapi: string }).openapi).toBe("3.1.0");
    }
  });

  it("rejects unsupported file extensions", async () => {
    const source: SourceDescriptor = { kind: "path", path: join(fixturesDir, "spec.txt") };
    await expect(fetchSpec(source)).rejects.toBeInstanceOf(FetchError);
  });

  it("rejects missing files", async () => {
    const source: SourceDescriptor = {
      kind: "path",
      path: join(fixturesDir, "does-not-exist.yaml"),
    };
    await expect(fetchSpec(source)).rejects.toBeInstanceOf(FetchError);
  });
});

describe("fetchSpec — remote", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    delete process.env["TEST_TOKEN"];
  });

  it("rejects http:// without allowInsecure", async () => {
    const source: SourceDescriptor = { kind: "url", url: "http://example.com/openapi.json" };
    await expect(fetchSpec(source)).rejects.toBeInstanceOf(FetchError);
  });

  it("permits http:// when allowInsecure is true", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ openapi: "3.0.0", info: {}, paths: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const source: SourceDescriptor = {
      kind: "url",
      url: "http://example.com/openapi.json",
      allowInsecure: true,
    };
    const res = await fetchSpec(source);
    expect(res.kind).toBe("fresh");
  });

  it("forwards interpolated auth headers", async () => {
    process.env["TEST_TOKEN"] = "abc123";
    const seen: Headers[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      seen.push(new Headers((init as RequestInit | undefined)?.headers));
      return new Response(JSON.stringify({ openapi: "3.0.0" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const source: SourceDescriptor = {
      kind: "url",
      url: "https://example.com/openapi.json",
      headers: { Authorization: "Bearer ${TEST_TOKEN}" },
    };
    await fetchSpec(source);
    expect(seen[0]?.get("authorization")).toBe("Bearer abc123");
  });

  it("raises MissingEnvError when header references an unset env var", async () => {
    globalThis.fetch = vi.fn();
    const source: SourceDescriptor = {
      kind: "url",
      url: "https://example.com/openapi.json",
      headers: { Authorization: "Bearer ${MISSING_FETCHER_TOKEN}" },
    };
    await expect(fetchSpec(source)).rejects.toBeInstanceOf(MissingEnvError);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns not-modified on 304", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 304 }));
    const res = await fetchSpec(
      { kind: "url", url: "https://example.com/openapi.json" },
      { etag: "abc" },
    );
    expect(res.kind).toBe("not-modified");
  });

  it("sends If-None-Match when etag is provided", async () => {
    const seen: Headers[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      seen.push(new Headers((init as RequestInit | undefined)?.headers));
      return new Response(null, { status: 304 });
    });
    await fetchSpec(
      { kind: "url", url: "https://example.com/openapi.json" },
      { etag: "W/\"abc\"" },
    );
    expect(seen[0]?.get("if-none-match")).toBe("W/\"abc\"");
  });

  it("raises FetchError with hint on 401", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("nope", { status: 401, statusText: "Unauthorized" }),
    );
    await expect(
      fetchSpec({ kind: "url", url: "https://example.com/openapi.json" }),
    ).rejects.toMatchObject({
      code: "E_FETCH",
      hint: expect.stringContaining("authentication"),
    });
  });

  it("raises FetchError when the body does not parse", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("{ not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      fetchSpec({ kind: "url", url: "https://example.com/openapi.json" }),
    ).rejects.toBeInstanceOf(FetchError);
  });

  it("captures etag and last-modified from response", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ openapi: "3.0.0" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            etag: "W/\"v1\"",
            "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT",
          },
        }),
    );
    const res = await fetchSpec({ kind: "url", url: "https://example.com/openapi.json" });
    expect(res.kind).toBe("fresh");
    if (res.kind === "fresh") {
      expect(res.etag).toBe("W/\"v1\"");
      expect(res.lastModified).toBe("Wed, 21 Oct 2015 07:28:00 GMT");
    }
  });
});
