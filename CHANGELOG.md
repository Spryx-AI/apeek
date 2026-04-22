# @spryx-ai/apeek

## 0.2.0

### Minor Changes

- 2c70bb0: Initial release of apeek — OpenAPI context lookup CLI for AI coding agents.

  Highlights:
  - Query commands: `apeek search`, `apeek op <METHOD> <path>`, `apeek schema <Name>`
  - Source management: `apeek source add|list|use|remove|refresh|info` with per-source auth headers (env-var interpolated at fetch time, never persisted)
  - Filesystem cache at `~/.cache/apeek/` with TTL + ETag invalidation, atomic writes, mode 0600/0700 on POSIX
  - XDG-compliant config at `~/.config/apeek/config.json`, per-project `.apeekrc.json` overlay
  - Zero-config autodiscovery: walks cwd→root for `openapi.{json,yaml,yml}` and `swagger.*`
  - Output formats: markdown (default, agent-optimized), json, compact
  - Agent integrations for **Claude Code** (`SKILL.md`) and **Cursor** (`.cursor/rules/apeek.mdc`) via `apeek setup` or `apeek install <agent>`
  - Codex, Windsurf, Continue registered as v0.2 extensibility targets (install returns a clear "planned for v0.2" error today)
  - Typed error hierarchy with stable exit codes (1 user / 2 config-IO / 3 network / 99 unexpected)

  Requires Node.js ≥ 20. See `docs/AGENTS.md` for agent integration guidance.
