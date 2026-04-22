## Why

AI coding agents working against HTTP APIs need precise, on-demand access to OpenAPI specs, but every existing path is expensive or wrong:

- **MCP servers** (e.g. `@ivotoby/openapi-mcp-server`) inject the entire spec into the agent's context on connect, burning tokens permanently even when the API is never queried. One server per API multiplies the cost.
- **Web search** returns marketing docs, not the spec, and misses internal APIs entirely.
- **Reading `openapi.json` directly** is token-expensive on large specs and parsing varies per agent.
- **Existing "OpenAPI agent" libraries** (LangChain, Google ADK, Azure) focus on *executing* API calls at runtime, not dev-time lookup.

The gap: there is no mature CLI doing for OpenAPI specs what `ctx7` does for library documentation. `apeek` fills that gap — a standalone CLI with near-zero context cost until invoked, returning focused answers to specific questions ("how do I create a deal?", "what's in the `Conversation` schema?"). Initial driver is replacing the OpenAPI MCP server the Spryx frontend team currently uses against the Spryx backend.

## What Changes

- **NEW**: `apeek` CLI distributed via npm (`@spryx-ai/apeek`), runnable as `npx @spryx-ai/apeek@latest` or global install. Node ≥20, ESM-only, TypeScript strict.
- **NEW**: Query commands — `search <query>`, `op <method> <path>`, `schema <name>` — returning agent-optimized markdown (also `json` / `compact` on demand).
- **NEW**: Source management — `source add|list|use|remove|refresh|info` with per-source auth headers (env-var interpolated, never persisted as secrets) and cache TTL.
- **NEW**: Zero-config autodiscovery — walks up from cwd for `openapi.{json,yaml,yml}`, `swagger.*`, `docs/openapi.*`, `api/openapi.*`.
- **NEW**: Per-project config overrides via `.apeekrc.json` / `apeek.config.json` merged on top of global `~/.config/apeek/config.json` (XDG-aware).
- **NEW**: Filesystem cache at `~/.cache/apeek/<source-hash>/` (mode 0700/0600) with TTL + ETag invalidation; `cache clear [<alias>]` and `--refresh` escape hatches.
- **NEW**: Agent integration for **Claude Code** (SKILL.md) and **Cursor** (`.cursor/rules/apeek.mdc`) via interactive `setup` wizard and non-interactive `install <agent> --scope=global|project`. Templates embedded in the bundle — no network required at setup time.
- **NEW**: Utility — `version`, `config get|set|path`.
- **OUT OF SCOPE (v0.1, deferred to v0.2+)**: `list` command (redundant with `search`), `doctor` command, Codex / Windsurf / Continue agent installers, embeddings-based search, MCP server mode, `diff` command, federated multi-source search. Codex/Windsurf/Continue are registered as extensibility targets in `agent-integration` so the architecture accommodates them without rework.
- **NON-GOALS (permanent)**: `apeek` does not execute HTTP requests, does not generate SDKs, does not validate/lint specs, does not serve over MCP.

## Capabilities

### New Capabilities

- `cli-foundation`: Commander-based CLI entrypoint, global flags (`--source|-s`, `--format|-f`, `--limit|-l`, `--no-color`, `--verbose|-v`, `--refresh`), stdout-vs-stderr output taxonomy, typed error hierarchy, `version` command, `cache clear [<alias>]` command, first-run welcome message.
- `openapi-source-management`: `source add|list|use|remove|refresh|info` commands; `config get|set|path` commands; zod-validated config file schema; env-var interpolation at read time (`${VAR}` in headers); per-project `.apeekrc.json` / `apeek.config.json` merge over global config; autodiscovery walking from cwd to filesystem root.
- `openapi-ingestion`: Fetcher supporting local files, HTTP(S), `file://`, per-source auth headers, HTTPS-enforced-unless-opted-out; parser wrapping `@readme/openapi-parser` to resolve `$ref`s and validate OpenAPI 3.0/3.1, normalizing to internal types (operations, schemas, tags, security, servers); filesystem cache with TTL (default 1h remote / never local), ETag/Last-Modified invalidation, mode 0700 dirs / 0600 files.
- `openapi-query`: `search` using minisearch with weighted fields (operationId/summary high, description/method+path/tags medium, parameters/request-body-schema low) over operations and component schemas; `op <method> <path>` returning full operation detail; `schema <name>` returning full component schema detail.
- `output-formatting`: Markdown formatter (default, agent-optimized — structured sections, fenced code blocks, no ASCII art or TTY spinners); JSON formatter (raw structured payload for programmatic consumers); compact formatter (single-line-per-result for tight context budgets). Respects `NO_COLOR` and `--no-color`.
- `agent-integration`: Agent detection by filesystem probes; installers for **Claude Code** (SKILL.md at `~/.claude/skills/apeek/` or `.claude/skills/apeek/`) and **Cursor** (`.cursor/rules/apeek.mdc`, `alwaysApply: true`) in v0.1; interactive `setup` wizard via `prompts` that detects → selects agents → optionally configures a default source (with connection test); non-interactive `install <agent> --scope=global|project`; templates embedded in `src/agents/templates/` as the single source of truth. Codex / Windsurf / Continue registered as named extensibility targets (module stubs + doc'd install paths) for v0.2 but **not implemented** in this change.

### Modified Capabilities

None — this is a greenfield repository (only `.claude/` and `openspec/` exist today).

## Impact

- **New repository layout**: `src/{cli,core,config,agents,lib}`, `tests/{unit,integration,fixtures}`, `docs/`, GitHub Actions workflows (`ci.yml`, `release.yml`), changesets config. See `design.md` for the full tree.
- **Tooling**: TypeScript 5.4+, `tsup` (esbuild) for bundling, `vitest` for tests, `eslint` + `prettier`, `changesets` for versioning/publishing.
- **Runtime dependencies** (locked in `design.md`): `commander`, `@readme/openapi-parser`, `minisearch`, `zod`, `kleur`, `prompts`, `js-yaml`, native `fetch`. Any addition beyond this list requires approval.
- **Distribution**: npm under `@spryx-ai` scope; `bin.apeek` → `dist/cli/index.js`; no `postinstall` scripts.
- **User filesystem writes**: `~/.config/apeek/config.json`, `~/.cache/apeek/`, `~/.claude/skills/apeek/SKILL.md` (or project-local), `.cursor/rules/apeek.mdc`. All creations gated on explicit user action (`setup`, `install`, `source add`).
- **Security posture**: no telemetry, no auto-update, no postinstall, secrets never persisted, HTTPS enforced for remote sources by default, cache files private to user.
- **Performance budget** (must hold at v1.0, baseline established in v0.1): startup <150ms; cold search on <100-op spec <3s; warm search <300ms; warm `op` <200ms; 500-op spec index <15MB on disk; build-time memory <300MB. Measured with `hyperfine` against fixture specs.
- **Downstream**: Spryx frontend team migrates from the OpenAPI MCP server to `apeek` once v0.1 ships; this drives validation of the Claude Code skill template end-to-end.
