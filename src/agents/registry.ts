import { AgentInstallError } from "../lib/errors.js";

export type AgentId = "claude-code" | "cursor" | "codex" | "windsurf" | "continue";

export interface DetectResult {
  readonly detected: boolean;
  readonly marker?: string;
}

export interface DetectOpts {
  readonly home?: string;
  readonly cwd?: string;
}

export interface InstallOpts {
  readonly scope: "global" | "project";
  readonly home?: string;
  readonly cwd?: string;
  readonly overwrite?: boolean;
}

export interface InstallResult {
  readonly path: string;
  readonly overwritten: boolean;
}

export interface AgentIntegration {
  readonly id: AgentId;
  readonly displayName: string;
  readonly supported: boolean;
  detect(opts?: DetectOpts): DetectResult;
  install(opts: InstallOpts): Promise<InstallResult>;
}

const agents = new Map<AgentId, AgentIntegration>();

export function registerAgent(agent: AgentIntegration): void {
  agents.set(agent.id, agent);
}

export function getAgent(id: string): AgentIntegration {
  const agent = agents.get(id as AgentId);
  if (agent === undefined) {
    const known = Array.from(agents.keys());
    throw new AgentInstallError(`unknown agent id: ${id}`, {
      hint: `known ids: ${known.join(", ")}`,
    });
  }
  return agent;
}

export function listAgents(): AgentIntegration[] {
  return Array.from(agents.values());
}
