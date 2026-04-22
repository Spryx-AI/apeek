import { claudeCodeAgent } from "./claude-code.js";
import { cursorAgent } from "./cursor.js";
import { codexAgent, continueAgent, windsurfAgent } from "./stubs.js";
import { registerAgent } from "./registry.js";

let registered = false;

export function ensureAgentsRegistered(): void {
  if (registered) return;
  registered = true;
  registerAgent(claudeCodeAgent);
  registerAgent(cursorAgent);
  registerAgent(codexAgent);
  registerAgent(windsurfAgent);
  registerAgent(continueAgent);
}

export { getAgent, listAgents } from "./registry.js";
export type { AgentId, AgentIntegration, InstallOpts, InstallResult } from "./registry.js";
