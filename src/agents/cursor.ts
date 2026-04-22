import { join } from "node:path";
import type { AgentIntegration, DetectOpts, InstallOpts, InstallResult } from "./registry.js";
import { cwdOrDefault, detectCursor, homeOrDefault } from "./detect.js";
import { writeTemplateFile } from "./install-helpers.js";
import { cursorRule } from "./templates/cursor-rule.js";

export function cursorInstallPath(opts: InstallOpts): string {
  const base =
    opts.scope === "project"
      ? join(cwdOrDefault(opts), ".cursor", "rules")
      : join(homeOrDefault(opts), ".cursor", "rules");
  return join(base, "apeek.mdc");
}

export const cursorAgent: AgentIntegration = {
  id: "cursor",
  displayName: "Cursor",
  supported: true,
  detect(opts?: DetectOpts) {
    return detectCursor(opts);
  },
  async install(opts: InstallOpts): Promise<InstallResult> {
    const path = cursorInstallPath(opts);
    const { overwritten } = writeTemplateFile(path, cursorRule, { mode: 0o644 });
    return { path, overwritten };
  },
};
