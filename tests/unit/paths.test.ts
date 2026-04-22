import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getCacheRoot,
  getGlobalConfigDir,
  getGlobalConfigPath,
  PROJECT_CONFIG_FILENAMES,
} from "../../src/config/paths.js";

describe("paths", () => {
  const originalConfig = process.env["XDG_CONFIG_HOME"];
  const originalCache = process.env["XDG_CACHE_HOME"];

  beforeEach(() => {
    delete process.env["XDG_CONFIG_HOME"];
    delete process.env["XDG_CACHE_HOME"];
  });

  afterEach(() => {
    if (originalConfig !== undefined) process.env["XDG_CONFIG_HOME"] = originalConfig;
    else delete process.env["XDG_CONFIG_HOME"];
    if (originalCache !== undefined) process.env["XDG_CACHE_HOME"] = originalCache;
    else delete process.env["XDG_CACHE_HOME"];
  });

  describe("getGlobalConfigDir", () => {
    it("honors XDG_CONFIG_HOME when set", () => {
      process.env["XDG_CONFIG_HOME"] = "/custom/config";
      expect(getGlobalConfigDir()).toBe("/custom/config/apeek");
    });

    it("falls back to ~/.config/apeek when unset", () => {
      expect(getGlobalConfigDir()).toBe(join(homedir(), ".config", "apeek"));
    });

    it("falls back when XDG_CONFIG_HOME is empty string", () => {
      process.env["XDG_CONFIG_HOME"] = "";
      expect(getGlobalConfigDir()).toBe(join(homedir(), ".config", "apeek"));
    });
  });

  describe("getGlobalConfigPath", () => {
    it("appends config.json to the config dir", () => {
      process.env["XDG_CONFIG_HOME"] = "/custom/config";
      expect(getGlobalConfigPath()).toBe("/custom/config/apeek/config.json");
    });
  });

  describe("getCacheRoot", () => {
    it("honors XDG_CACHE_HOME when set", () => {
      process.env["XDG_CACHE_HOME"] = "/custom/cache";
      expect(getCacheRoot()).toBe("/custom/cache/apeek");
    });

    it("falls back to ~/.cache/apeek when unset", () => {
      expect(getCacheRoot()).toBe(join(homedir(), ".cache", "apeek"));
    });
  });

  describe("PROJECT_CONFIG_FILENAMES", () => {
    it("lists both project config filenames", () => {
      expect(PROJECT_CONFIG_FILENAMES).toContain(".apeekrc.json");
      expect(PROJECT_CONFIG_FILENAMES).toContain("apeek.config.json");
    });
  });
});
