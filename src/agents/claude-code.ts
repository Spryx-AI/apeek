import { join } from "node:path";
import type { AgentIntegration, DetectOpts, InstallOpts, InstallResult } from "./registry.js";
import { cwdOrDefault, detectClaudeCode, homeOrDefault } from "./detect.js";
import { writeTemplateFile } from "./install-helpers.js";
import { claudeCodeSkill } from "./templates/claude-code-skill.js";

export function claudeCodeInstallPath(opts: InstallOpts): string {
  const base =
    opts.scope === "project"
      ? join(cwdOrDefault(opts), ".claude", "skills", "apeek")
      : join(homeOrDefault(opts), ".claude", "skills", "apeek");
  return join(base, "SKILL.md");
}

export const claudeCodeAgent: AgentIntegration = {
  id: "claude-code",
  displayName: "Claude Code",
  supported: true,
  detect(opts?: DetectOpts) {
    return detectClaudeCode(opts);
  },
  async install(opts: InstallOpts): Promise<InstallResult> {
    const path = claudeCodeInstallPath(opts);
    const { overwritten } = writeTemplateFile(path, claudeCodeSkill, { mode: 0o644 });
    return { path, overwritten };
  },
};
