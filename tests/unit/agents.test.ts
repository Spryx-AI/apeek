import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeAgent, claudeCodeInstallPath } from "../../src/agents/claude-code.js";
import { cursorAgent, cursorInstallPath } from "../../src/agents/cursor.js";
import { codexAgent, continueAgent, windsurfAgent } from "../../src/agents/stubs.js";
import { ensureAgentsRegistered, getAgent, listAgents } from "../../src/agents/index.js";
import { claudeCodeSkill } from "../../src/agents/templates/claude-code-skill.js";
import { cursorRule } from "../../src/agents/templates/cursor-rule.js";
import { AgentInstallError } from "../../src/lib/errors.js";

describe("agent registry", () => {
  it("registers all five v0.1 ids when ensureAgentsRegistered is called", () => {
    ensureAgentsRegistered();
    const ids = listAgents().map((a) => a.id).sort();
    expect(ids).toEqual(["claude-code", "codex", "continue", "cursor", "windsurf"]);
  });

  it("getAgent returns the agent by id", () => {
    ensureAgentsRegistered();
    expect(getAgent("claude-code").id).toBe("claude-code");
    expect(getAgent("cursor").supported).toBe(true);
  });

  it("getAgent on unknown id throws AgentInstallError with known-ids hint", () => {
    ensureAgentsRegistered();
    expect(() => getAgent("bogus")).toThrowError(AgentInstallError);
  });

  it("v0.2 stubs are registered as supported=false", () => {
    ensureAgentsRegistered();
    expect(codexAgent.supported).toBe(false);
    expect(windsurfAgent.supported).toBe(false);
    expect(continueAgent.supported).toBe(false);
  });
});

describe("claude-code agent", () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "apeek-cc-"));
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("global install writes to ~/.claude/skills/apeek/SKILL.md", async () => {
    const result = await claudeCodeAgent.install({ scope: "global", home: sandbox });
    expect(result.path).toBe(join(sandbox, ".claude", "skills", "apeek", "SKILL.md"));
    expect(result.overwritten).toBe(false);
    const content = readFileSync(result.path, "utf8");
    expect(content).toBe(claudeCodeSkill);
  });

  it("project install writes to ./.claude/skills/apeek/SKILL.md", async () => {
    const projectDir = join(sandbox, "proj");
    mkdirSync(projectDir);
    const result = await claudeCodeAgent.install({ scope: "project", cwd: projectDir });
    expect(result.path).toBe(join(projectDir, ".claude", "skills", "apeek", "SKILL.md"));
  });

  it("install overwrites and reports overwritten=true", async () => {
    const projectDir = join(sandbox, "proj");
    mkdirSync(join(projectDir, ".claude", "skills", "apeek"), { recursive: true });
    writeFileSync(
      join(projectDir, ".claude", "skills", "apeek", "SKILL.md"),
      "stale content",
    );
    const result = await claudeCodeAgent.install({ scope: "project", cwd: projectDir });
    expect(result.overwritten).toBe(true);
    expect(readFileSync(result.path, "utf8")).toBe(claudeCodeSkill);
  });

  it("installed file matches the bundled template byte-for-byte", async () => {
    const path = claudeCodeInstallPath({ scope: "global", home: sandbox });
    await claudeCodeAgent.install({ scope: "global", home: sandbox });
    expect(readFileSync(path, "utf8")).toBe(claudeCodeSkill);
  });

  it("detect reports detected when ~/.claude/ exists", () => {
    mkdirSync(join(sandbox, ".claude"), { recursive: true });
    const d = claudeCodeAgent.detect({ home: sandbox });
    expect(d.detected).toBe(true);
  });

  it("detect reports not detected when ~/.claude/ missing", () => {
    const d = claudeCodeAgent.detect({ home: sandbox });
    expect(d.detected).toBe(false);
  });
});

describe("cursor agent", () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "apeek-cursor-"));
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("project install writes to .cursor/rules/apeek.mdc", async () => {
    const projectDir = join(sandbox, "proj");
    mkdirSync(projectDir);
    const result = await cursorAgent.install({ scope: "project", cwd: projectDir });
    expect(result.path).toBe(join(projectDir, ".cursor", "rules", "apeek.mdc"));
    expect(readFileSync(result.path, "utf8")).toBe(cursorRule);
  });

  it("installed rule matches bundled template byte-for-byte", async () => {
    const path = cursorInstallPath({ scope: "project", cwd: sandbox });
    await cursorAgent.install({ scope: "project", cwd: sandbox });
    expect(readFileSync(path, "utf8")).toBe(cursorRule);
  });

  it("detect finds .cursor/ in cwd", () => {
    mkdirSync(join(sandbox, ".cursor"), { recursive: true });
    const d = cursorAgent.detect({ cwd: sandbox });
    expect(d.detected).toBe(true);
  });
});

describe("v0.2 agent stubs", () => {
  it("each stub's install() rejects with AgentInstallError and v0.2 hint", async () => {
    for (const agent of [codexAgent, windsurfAgent, continueAgent]) {
      await expect(agent.install({ scope: "global" })).rejects.toMatchObject({
        code: "E_AGENT_INSTALL",
        message: expect.stringContaining("v0.2"),
      });
    }
  });
});

describe("template content", () => {
  it("Claude Code skill frontmatter has name: apeek and description with triggers", () => {
    expect(claudeCodeSkill.startsWith("---\n")).toBe(true);
    expect(claudeCodeSkill).toContain("name: apeek");
    expect(claudeCodeSkill).toContain("how do I call X");
    expect(claudeCodeSkill).toContain("apeek search");
    expect(claudeCodeSkill).toContain("apeek op");
    expect(claudeCodeSkill).toContain("apeek schema");
    expect(claudeCodeSkill).toContain("more than 5 times");
    expect(claudeCodeSkill).toContain("npx @spryx-ai/apeek@latest setup");
  });

  it("Cursor rule has alwaysApply: true and the three commands", () => {
    expect(cursorRule).toContain("alwaysApply: true");
    expect(cursorRule).toContain("apeek search");
    expect(cursorRule).toContain("apeek op");
    expect(cursorRule).toContain("apeek schema");
    expect(cursorRule).toContain("Max 5 apeek calls");
    expect(cursorRule).toContain("npx @spryx-ai/apeek@latest setup");
  });
});
