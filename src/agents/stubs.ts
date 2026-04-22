import { AgentInstallError } from "../lib/errors.js";
import type { AgentId, AgentIntegration, DetectOpts, InstallOpts, InstallResult } from "./registry.js";
import { detectCodex, detectContinue, detectWindsurf } from "./detect.js";

function stubInstall(id: AgentId): Promise<InstallResult> {
  return Promise.reject(
    new AgentInstallError(`${id} integration is planned for v0.2`, {
      hint: "install Claude Code or Cursor for now, and watch the changelog for v0.2",
    }),
  );
}

export const codexAgent: AgentIntegration = {
  id: "codex",
  displayName: "Codex (CLI)",
  supported: false,
  detect(opts?: DetectOpts) {
    return detectCodex(opts);
  },
  install(_opts: InstallOpts) {
    return stubInstall("codex");
  },
};

export const windsurfAgent: AgentIntegration = {
  id: "windsurf",
  displayName: "Windsurf",
  supported: false,
  detect(opts?: DetectOpts) {
    return detectWindsurf(opts);
  },
  install(_opts: InstallOpts) {
    return stubInstall("windsurf");
  },
};

export const continueAgent: AgentIntegration = {
  id: "continue",
  displayName: "Continue",
  supported: false,
  detect(opts?: DetectOpts) {
    return detectContinue(opts);
  },
  install(_opts: InstallOpts) {
    return stubInstall("continue");
  },
};
