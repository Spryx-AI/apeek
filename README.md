# apeek

**OpenAPI context lookup CLI for AI coding agents.**

`apeek` lets AI coding agents (Claude Code, Cursor) query OpenAPI specifications — local files or remote endpoints — without burning context tokens on the full spec. It's the `ctx7` pattern for OpenAPI: low-cost on-demand lookup, agent-optimized markdown output, zero-config when `openapi.json` sits in your repo.

## Install

```bash
# Ad-hoc (preferred for agents)
npx @spryx-ai/apeek@latest <command>

# Global install
npm install -g @spryx-ai/apeek
apeek <command>
```

Requires **Node.js ≥ 20**.

## Quickstart

### With an existing `openapi.json` in your repo

```bash
cd my-fastapi-project/   # openapi.json exists here or in a parent
apeek search "user registration"
```

### With a remote spec behind auth

```bash
apeek source add spryx https://api.spryx.ai/openapi.json \
  --header 'Authorization=Bearer ${SPRYX_DOCS_TOKEN}'
export SPRYX_DOCS_TOKEN=...
apeek search "create a deal"
apeek op POST /deals
apeek schema Deal
```

Header values containing `${VAR}` are resolved **at fetch time** from the environment — secrets never land on disk.

### Interactive first-run

```bash
apeek setup
```

Detects installed agents, installs the appropriate skill/rule, and optionally configures a default source with a connection test.

## Commands

**Query:**

| | |
|---|---|
| `apeek search <query>` | semantic search over operations and schemas |
| `apeek op <METHOD> <path>` | full operation detail (parameters, request body, responses, example) |
| `apeek schema <Name>` | full component schema with property table |

**Source management:**

| | |
|---|---|
| `apeek source add <alias> <url-or-path>` | register a new source |
| `apeek source list` | list configured sources (default marked with `*`) |
| `apeek source use <alias>` | set default source |
| `apeek source remove <alias>` | remove source + its cache |
| `apeek source refresh [<alias>]` | bypass cache, refetch + reindex |
| `apeek source info <alias>` | print metadata (never prints resolved secret values) |

**Setup & config:**

| | |
|---|---|
| `apeek setup` | interactive first-run wizard |
| `apeek install <agent> [--scope=global|project]` | install skill/rule for one agent |
| `apeek config get <key>` | read config (dotted path) |
| `apeek config set <key> <value>` | write config |
| `apeek config path` | print config file location |

**Utility:**

| | |
|---|---|
| `apeek version` | print version |
| `apeek cache clear [<alias>]` | clear cache for one or all sources |

### Global flags (all query commands)

| | |
|---|---|
| `-s, --source <alias>` | override default source |
| `-f, --format <fmt>` | output format: `markdown` (default), `json`, `compact` |
| `-l, --limit <n>` | max search results (default 5) |
| `--no-color` | disable ANSI color |
| `-v, --verbose` | debug logging to stderr |
| `--refresh` | bypass cache for this call |

## Agent integrations

### Claude Code

```bash
apeek install claude-code --scope=global   # ~/.claude/skills/apeek/SKILL.md
apeek install claude-code --scope=project  # ./.claude/skills/apeek/SKILL.md
```

After install, Claude Code will auto-invoke `apeek` when you ask API questions.

### Cursor

```bash
apeek install cursor --scope=project   # ./.cursor/rules/apeek.mdc (alwaysApply: true)
```

### Codex, Windsurf, Continue

Planned for v0.2. Running `apeek install codex` today surfaces a clear "planned for v0.2" error.

## Per-project config (`.apeekrc.json`)

Drop this into the root of a project to override global config without editing it:

```json
{
  "version": 1,
  "defaultSource": "internal",
  "sources": {
    "internal": {
      "url": "https://internal.example/openapi.json"
    }
  }
}
```

Project config merges **over** global config at load time. Only one of `.apeekrc.json` or `apeek.config.json` may be present — both is an error.

## Security

- Secrets are never persisted. Config stores `${ENV_VAR}` references; resolution happens at request time only.
- HTTPS is enforced for remote sources unless you opt in with `--allow-insecure`.
- Cache files are mode `0600`, directories `0700` on POSIX (best-effort on Windows — see note below).
- No postinstall scripts, no telemetry, no auto-update.

### Windows

Core functionality works on Windows, but POSIX file-mode semantics (`0600`/`0700`) don't translate to NTFS. The runtime attempts to set modes and silently continues if it can't. macOS and Linux are the CI matrix.

## Non-goals

- `apeek` does **not** execute HTTP requests against the APIs it documents.
- It does **not** generate SDKs or client code.
- It does **not** lint or validate specs (use `spectral` or `redocly lint`).
- It does **not** serve specs over MCP.

## Links

- [Architecture](docs/ARCHITECTURE.md)
- [Agent integration guide](docs/AGENTS.md)
- [LICENSE](LICENSE) — MIT

## Status

Pre-1.0. The CLI surface (§2.2 of the design) is stable; internal modules are not. Breaking changes between minor versions are possible until 1.0.0; patch releases never break.
