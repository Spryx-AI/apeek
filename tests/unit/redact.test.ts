import { describe, expect, it } from "vitest";
import { isSensitiveHeader, redactHeaders } from "../../src/lib/redact.js";

describe("redactHeaders", () => {
  it("masks Authorization regardless of case", () => {
    const out = redactHeaders({ Authorization: "Bearer abc", AUTHORIZATION: "Bearer xyz" });
    expect(out["Authorization"]).toBe("<redacted>");
    expect(out["AUTHORIZATION"]).toBe("<redacted>");
  });

  it("masks Cookie and Set-Cookie", () => {
    const out = redactHeaders({ Cookie: "sid=1", "Set-Cookie": "sid=2" });
    expect(out["Cookie"]).toBe("<redacted>");
    expect(out["Set-Cookie"]).toBe("<redacted>");
  });

  it("masks Api-Key and X-Api-Key", () => {
    const out = redactHeaders({ "Api-Key": "k", "X-Api-Key": "k", "X-Vendor-Api-Key": "k" });
    expect(out["Api-Key"]).toBe("<redacted>");
    expect(out["X-Api-Key"]).toBe("<redacted>");
    expect(out["X-Vendor-Api-Key"]).toBe("<redacted>");
  });

  it("masks any *-Token header", () => {
    const out = redactHeaders({ "X-Access-Token": "t", "Refresh-Token": "r" });
    expect(out["X-Access-Token"]).toBe("<redacted>");
    expect(out["Refresh-Token"]).toBe("<redacted>");
  });

  it("leaves non-sensitive headers alone", () => {
    const out = redactHeaders({ Accept: "application/json", "User-Agent": "apeek/0.1" });
    expect(out["Accept"]).toBe("application/json");
    expect(out["User-Agent"]).toBe("apeek/0.1");
  });

  it("isSensitiveHeader is case-insensitive", () => {
    expect(isSensitiveHeader("authorization")).toBe(true);
    expect(isSensitiveHeader("AUTHORIZATION")).toBe(true);
    expect(isSensitiveHeader("Accept")).toBe(false);
  });
});
