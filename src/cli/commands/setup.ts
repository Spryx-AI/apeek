import { Command } from "commander";
import prompts from "prompts";
import { AgentInstallError } from "../../lib/errors.js";
import { info, stderr, warn } from "../output.js";
import {
  ensureAgentsRegistered,
  getAgent,
  listAgents,
  type InstallResult,
} from "../../agents/index.js";
import { addSource } from "../../core/source-manager.js";
import { loadIndexedSpec } from "../../core/query-context.js";
import type { SourceDescriptor } from "../../types.js";

interface SetupAnswers {
  agents: string[] | undefined;
  claudeCodeScope: "global" | "project" | undefined;
  cursorScope: "global" | "project" | undefined;
  configureSource: boolean | undefined;
  alias: string | undefined;
  target: string | undefined;
  hasAuth: boolean | undefined;
  headerName: string | undefined;
  headerValue: string | undefined;
}

export function buildSetupCommand(): Command {
  return new Command("setup")
    .description("interactive first-run wizard: install agent skills and configure a source")
    .action(async () => {
      ensureAgentsRegistered();
      if (!process.stdin.isTTY) {
        throw new AgentInstallError("apeek setup requires an interactive TTY", {
          hint: "use 'apeek install <agent> [--scope=...]' and 'apeek source add' non-interactively",
        });
      }
      await runSetup();
    });
}

async function runSetup(): Promise<void> {
  stderr("Welcome to apeek setup.");
  stderr("");
  const supported = listAgents().filter((a) => a.supported);
  const detected = supported
    .map((a) => ({ agent: a, detect: a.detect() }))
    .filter((x) => x.detect.detected);

  stderr("Scanning for agents...");
  for (const a of supported) {
    const d = a.detect();
    const mark = d.detected ? "✓" : "✗";
    stderr(`  ${mark} ${a.displayName}${d.marker !== undefined ? ` (${d.marker})` : ""}`);
  }
  stderr("");

  const answers: SetupAnswers = {
    agents: undefined,
    claudeCodeScope: undefined,
    cursorScope: undefined,
    configureSource: undefined,
    alias: undefined,
    target: undefined,
    hasAuth: undefined,
    headerName: undefined,
    headerValue: undefined,
  };

  const agentChoices = supported.map((a) => ({
    title: a.displayName,
    value: a.id,
    selected: detected.some((d) => d.agent.id === a.id),
  }));

  const a1 = (await prompts(
    {
      type: "multiselect",
      name: "agents",
      message: "Which agents should apeek integrate with?",
      choices: agentChoices,
      hint: "space to select, enter to confirm",
      instructions: false,
    },
    { onCancel: () => process.exit(1) },
  )) as Pick<SetupAnswers, "agents">;
  answers.agents = a1.agents;

  for (const agentId of answers.agents ?? []) {
    const scope = (await prompts(
      {
        type: "select",
        name: "scope",
        message: `Install scope for ${getAgent(agentId).displayName}`,
        choices: [
          { title: "Global — available in every project", value: "global" },
          { title: "Project — only this repo", value: "project" },
        ],
        initial: 0,
      },
      { onCancel: () => process.exit(1) },
    )) as { scope: "global" | "project" };
    if (agentId === "claude-code") answers.claudeCodeScope = scope.scope;
    if (agentId === "cursor") answers.cursorScope = scope.scope;
  }

  const sourcePrompt = (await prompts(
    {
      type: "toggle",
      name: "configureSource",
      message: "Configure a default OpenAPI source now?",
      active: "yes",
      inactive: "no",
      initial: true,
    },
    { onCancel: () => process.exit(1) },
  )) as Pick<SetupAnswers, "configureSource">;
  answers.configureSource = sourcePrompt.configureSource;

  if (answers.configureSource === true) {
    const srcAnswers = (await prompts(
      [
        { type: "text", name: "alias", message: "Alias", initial: "default" },
        { type: "text", name: "target", message: "URL or path" },
        {
          type: "toggle",
          name: "hasAuth",
          message: "Does this source require authentication?",
          active: "yes",
          inactive: "no",
          initial: false,
        },
      ],
      { onCancel: () => process.exit(1) },
    )) as Pick<SetupAnswers, "alias" | "target" | "hasAuth">;
    answers.alias = srcAnswers.alias;
    answers.target = srcAnswers.target;
    answers.hasAuth = srcAnswers.hasAuth;

    if (srcAnswers.hasAuth === true) {
      const authAnswers = (await prompts(
        [
          { type: "text", name: "headerName", message: "Header name", initial: "Authorization" },
          {
            type: "text",
            name: "headerValue",
            message: "Header value (can reference ${ENV_VAR})",
          },
        ],
        { onCancel: () => process.exit(1) },
      )) as Pick<SetupAnswers, "headerName" | "headerValue">;
      answers.headerName = authAnswers.headerName;
      answers.headerValue = authAnswers.headerValue;
    }
  }

  // Plan: validate the source first (so we can roll back cleanly), then write
  // everything. If source validation fails, ask whether to save anyway.
  let descriptor: SourceDescriptor | undefined;
  if (answers.configureSource === true && answers.alias !== undefined && answers.target !== undefined) {
    descriptor = planSource(answers);
    const testResult = await testSource(descriptor);
    if (!testResult.ok) {
      stderr(`Connection test failed: ${testResult.error}`);
      const save = (await prompts(
        {
          type: "toggle",
          name: "save",
          message: "Save this source anyway?",
          active: "yes",
          inactive: "no",
          initial: false,
        },
        { onCancel: () => process.exit(1) },
      )) as { save: boolean };
      if (save.save !== true) {
        descriptor = undefined;
        answers.alias = undefined;
      }
    } else {
      stderr(
        `  ✓ Fetched and indexed (${testResult.operations} operations, ${testResult.schemas} schemas)`,
      );
    }
  }

  // Install agents atomically: if any fails, we don't rewrite anything we've
  // already written; but since each install writes exactly one file, a
  // partial sequence is recoverable by rerunning 'install' per agent.
  const written: InstallResult[] = [];
  try {
    for (const agentId of answers.agents ?? []) {
      const scope =
        agentId === "claude-code" ? answers.claudeCodeScope : answers.cursorScope;
      if (scope === undefined) continue;
      const agent = getAgent(agentId);
      const res = await agent.install({ scope });
      written.push(res);
      stderr(
        `  ✓ Wrote ${agent.displayName} integration to ${res.path}${res.overwritten ? " (overwrote existing)" : ""}`,
      );
    }
    if (
      descriptor !== undefined &&
      answers.alias !== undefined &&
      answers.target !== undefined
    ) {
      addSource({
        alias: answers.alias,
        target: answers.target,
        ...(answers.headerName !== undefined && answers.headerValue !== undefined
          ? { headers: { [answers.headerName]: answers.headerValue } }
          : {}),
        ...(answers.target.startsWith("http://") ? { allowInsecure: true } : {}),
      });
      stderr(`  ✓ Added source '${answers.alias}'`);
    }
  } catch (err) {
    warn(
      "setup failed partway through; files already written will remain but no further writes will happen",
    );
    throw err;
  }

  stderr("");
  info("Setup complete!");
  info("");
  info("Try it out:");
  info("  apeek search \"create a deal\"");
  info("  apeek op POST /deals");
  info("");
  const skipped = listAgents().filter((a) => !a.supported);
  if (skipped.length > 0) {
    info(
      `Available in v0.2: ${skipped.map((a) => a.displayName).join(", ")}`,
    );
  }
}

function planSource(answers: SetupAnswers): SourceDescriptor {
  const target = answers.target!;
  if (target.startsWith("http://") || target.startsWith("https://")) {
    const headers =
      answers.headerName !== undefined && answers.headerValue !== undefined
        ? { [answers.headerName]: answers.headerValue }
        : undefined;
    return {
      kind: "url",
      url: target,
      ...(headers !== undefined ? { headers } : {}),
      ...(target.startsWith("http://") ? { allowInsecure: true } : {}),
    };
  }
  return { kind: "path", path: target };
}

interface TestResult {
  ok: boolean;
  error?: string;
  operations?: number;
  schemas?: number;
}

async function testSource(descriptor: SourceDescriptor): Promise<TestResult> {
  try {
    const { spec } = await loadIndexedSpec(descriptor, { refresh: true });
    return {
      ok: true,
      operations: spec.operations.length,
      schemas: Object.keys(spec.schemas).length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
