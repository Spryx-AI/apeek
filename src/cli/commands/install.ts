import { Command } from "commander";
import { ensureAgentsRegistered, getAgent } from "../../agents/index.js";
import { AgentInstallError } from "../../lib/errors.js";
import { info, warn } from "../output.js";

export function buildInstallCommand(): Command {
  return new Command("install")
    .description("install apeek integration for a specific agent")
    .argument("<agent>", "agent id (claude-code, cursor)")
    .option("--scope <scope>", "install scope: global or project", "global")
    .option("--cwd <path>", "override the project directory for --scope=project")
    .action(async (agentId: string, opts: { scope: string; cwd?: string }) => {
      ensureAgentsRegistered();
      const scope = opts.scope;
      if (scope !== "global" && scope !== "project") {
        throw new AgentInstallError(`invalid scope '${scope}'`, {
          hint: "scope must be 'global' or 'project'",
        });
      }
      const agent = getAgent(agentId);
      if (!agent.supported) {
        throw new AgentInstallError(`${agent.displayName} integration is planned for v0.2`, {
          hint: "install Claude Code or Cursor for now",
        });
      }
      const result = await agent.install({
        scope,
        ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
      });
      if (result.overwritten) {
        warn(`overwrote existing ${agent.displayName} integration at ${result.path}`);
      } else {
        info(`installed ${agent.displayName} integration at ${result.path}`);
      }
    });
}
