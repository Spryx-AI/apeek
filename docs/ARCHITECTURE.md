# Architecture

A short map of how `apeek` is put together. For decisions and rationale, see `openspec/changes/bootstrap-apeek-cli/design.md` (archived after v0.1 release).

## Component map

```
┌─────────────────────────────────────────────────────┐
│                  CLI entrypoint                      │
│           (commander, src/cli/index.ts)              │
└──────┬─────────────────┬─────────────────┬───────────┘
       │                 │                 │
       ▼                 ▼                 ▼
 ┌──────────┐      ┌──────────┐     ┌───────────┐
 │ Query    │      │ Source + │     │ Agents +  │
 │ commands │      │ Config   │     │ Setup     │
 │ (search, │      │ (source, │     │ (install, │
 │ op,      │      │ config,  │     │ setup)    │
 │ schema)  │      │ cache)   │     │           │
 └────┬─────┘      └────┬─────┘     └─────┬─────┘
      │                 │                 │
      ▼                 ▼                 ▼
 ┌──────────────────────────────────────────────────┐
 │               Core services (src/core/)          │
 │ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
 │ │source-   │ │ fetcher  │ │ parser           │   │
 │ │manager   │ │          │ │(openapi-parser)  │   │
 │ └──────────┘ └──────────┘ └──────────────────┘   │
 │ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
 │ │ indexer  │ │  cache   │ │ formatter        │   │
 │ │(minisearch)│ │        │ │(md/json/compact) │   │
 │ └──────────┘ └──────────┘ └──────────────────┘   │
 │ ┌──────────────┐ ┌───────────────────────────┐   │
 │ │autodiscovery │ │ source-resolver           │   │
 │ │              │ │ query-context             │   │
 │ └──────────────┘ └───────────────────────────┘   │
 └──────────────────────────────────────────────────┘
```

Supporting layers:

- `src/config/` — XDG path resolution, zod-validated config schema, global+project overlay loader
- `src/lib/` — typed error hierarchy, env-var interpolation, header redaction, logger
- `src/agents/` — pluggable registry, detect probes, Claude Code + Cursor installers, v0.2 stubs for Codex/Windsurf/Continue

## Data flow: `apeek search "create deal"`

1. CLI parses argv, hook sets output config (color, verbose).
2. `command-context.prepareQuery` loads merged config (global + optional project overlay).
3. `source-resolver.resolveSource` picks source in order: `--source` flag > `defaultSource` > autodiscovery walk cwd→root.
4. `query-context.loadIndexedSpec` checks cache — on hit and fresh, skip network; on stale with ETag, send `If-None-Match`; on 304, refresh meta and serve cached spec; on miss or 200, fetch → parse → index → cache.
5. `indexer.search(index, query, limit)` returns ranked `{ kind, id, score }` hits.
6. `search.ts` expands hits to full operation/schema objects and hands them to `formatter.selectRenderer(format)`.
7. Result hits stdout; debug/warnings/errors hit stderr.

## Error boundary

All throw sites use typed subclasses of `ApeekError` (`src/lib/errors.ts`). Each carries a stable `code` string and an `exitCode`. The CLI entrypoint's catch block maps the class to an exit code — `1` user, `2` config/IO, `3` network, `99` unexpected. No string-literal throws anywhere in the codebase.

## Cache

- Root: `$XDG_CACHE_HOME/apeek/` or `~/.cache/apeek/`
- Per-source directory: `<root>/<sha256-16-hex-of-canonical-id>/`
- Files: `spec.json` (normalized), `index.json` (serialized minisearch), `meta.json`
- `meta.json`: `{ fetchedAt, ttlSeconds, etag?, lastModified?, specHash, cacheSchemaVersion, nodeMajor }`
- Invalidation: TTL expiry (3600s remote / unlimited local by default), ETag/Last-Modified mismatch, `--refresh`, `apeek source refresh`, cache schema version bump, Node major version change
- Writes are atomic via `<file>.tmp` + rename; corrupt reads are treated as a miss (no user-visible error)
- Modes `0700`/`0600` on POSIX; best-effort on Windows

## Config

- Global: `$XDG_CONFIG_HOME/apeek/config.json` or `~/.config/apeek/config.json`
- Project: `./.apeekrc.json` **or** `./apeek.config.json` (both present = error)
- Project config is merged **over** global at query time (shallow top-level, deep per-alias source merge)
- Secrets never persisted: header values carry `${VAR}` references; resolution happens at fetch time only via `src/lib/env.ts`

## Performance budget

Targets (measured with `hyperfine`; baselines captured at v0.1 release):

| | |
|---|---|
| startup (no I/O) | < 150ms |
| search cold (<100 ops) | < 3s |
| search warm | < 300ms |
| op warm | < 200ms |
| 500-op index on disk | < 15MB |
| peak memory during build | < 300MB |

Tactics: lazy imports of heavy deps (parser, indexer, js-yaml) so `--version` and the first-run welcome never load them; cache warm path deserializes `spec.json` + `index.json` directly and never touches `@readme/openapi-parser`.

## Known limitations (v0.1)

- **Composed request-body schemas not flattened.** When an operation's request body uses `oneOf` / `allOf` / `anyOf` at the root (rather than a flat `type: object` with `properties`), the parser's `toSchemaInfo` reads no properties and the markdown formatter renders an empty `## Request body` section with just the media type. Examples in the wild: the OpenAI API's `CreateChatCompletionRequest`. Tracked as a v0.2 improvement — fix is to flatten the first variant or render "one of: <variants>" similar to how enums are rendered. Exercised (and intentionally tolerated) in `tests/integration/real-spec.test.ts`.

## Module boundaries (summary)

| Path | Purpose |
|---|---|
| `src/cli/index.ts` | commander entrypoint, error boundary, global flags, Node version check, first-run welcome |
| `src/cli/commands/*.ts` | one file per top-level subcommand |
| `src/cli/output.ts` | single point for stdout/stderr/debug/warn/error; TTY + NO_COLOR + --no-color gating |
| `src/cli/command-context.ts` | shared `prepareQuery` helper (resolve + load) for query commands |
| `src/core/fetcher.ts` | local + HTTP(S) fetch with ETag, interpolates headers at call time |
| `src/core/parser.ts` | `@readme/openapi-parser` wrapper with 30s timeout and version gating |
| `src/core/indexer.ts` | minisearch over operations + schemas with field weights |
| `src/core/cache.ts` | atomic FS cache with XDG paths, TTL, ETag, canonical source hashing |
| `src/core/formatter/` | markdown (default), json, compact renderers + `selectRenderer` dispatcher |
| `src/core/autodiscovery.ts` | cwd→root walk, extension precedence |
| `src/core/source-resolver.ts` | flag > default > autodiscovery precedence |
| `src/core/query-context.ts` | cache-aware load orchestration (hit → refresh meta / 304 / 200) |
| `src/core/source-manager.ts` | CRUD against the global config file + cache cleanup on remove |
| `src/config/schema.ts` | zod schema for config v1 |
| `src/config/loader.ts` | merged loader (global + project overlay) and global-only reader/writer |
| `src/config/paths.ts` | XDG-compliant resolution |
| `src/agents/registry.ts` | `AgentIntegration` interface + typed registry map |
| `src/agents/detect.ts` | filesystem-probe detection for all 5 agent ids |
| `src/agents/claude-code.ts`, `cursor.ts` | supported v0.1 installers |
| `src/agents/stubs.ts` | codex/windsurf/continue with v0.2 error |
| `src/agents/templates/*.ts` | skill/rule template content (TS strings, bundled) |
| `src/lib/errors.ts` | `ApeekError` hierarchy with stable codes and exit codes |
| `src/lib/env.ts` | `${VAR}` / `${VAR:-default}` interpolation |
| `src/lib/redact.ts` | header redaction for Authorization, *-token, api-key, etc. |
| `src/lib/logger.ts` | verbose-aware logger wired to output.ts |
