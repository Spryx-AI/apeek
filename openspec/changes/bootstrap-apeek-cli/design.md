## Context

`apeek` is a greenfield CLI. The repository today contains only `.claude/` and `openspec/` — no source, no build config, no dependencies. This design establishes the full technical substrate for v0.1: language, runtime, module boundaries, dependency set, cache/config layout, agent-integration extensibility, and the error/output model that every command shares.

The driving use case is replacing an OpenAPI MCP server the Spryx frontend team currently uses against the Spryx backend. That constrains us in three concrete ways:

1. **Agent-first output.** Markdown formatting is the default and must be tuned for LLM consumption (predictable sections, fenced code, no TTY decoration).
2. **Low startup latency.** Agents invoke `apeek` inside a larger reasoning loop; a cold invocation must complete on the budget set in the proposal (<150ms startup, <300ms warm query).
3. **Headers with secrets.** The Spryx spec sits behind a bearer token. Any design where secrets land on disk is a non-starter.

Target stakeholder is an AI coding agent running `apeek` non-interactively, with a human developer running `apeek setup` once and then mostly ignoring the tool. Both surfaces need to work; neither is primary.

## Goals / Non-Goals

**Goals:**

- Ship a working v0.1 with the 6 capabilities and 2 agents scoped in `proposal.md`.
- Keep startup latency budget achievable (§Performance below).
- Make adding Codex / Windsurf / Continue in v0.2 a matter of adding one `src/agents/<agent>.ts` file + one template, with no changes to `setup` / `install` / detect infrastructure.
- Secrets never land on disk. Config stores `${ENV_VAR}` references, resolution happens at fetch time only.
- Be `npx`-friendly: single bundled entrypoint, no postinstall, works on first invocation.

**Non-Goals:**

- Executing HTTP requests against the APIs being documented (this is a lookup tool).
- Supporting OpenAPI 2.0 / Swagger. Input must be OpenAPI 3.0 or 3.1.
- Windows as a first-class CI target in v0.1 — it should *work* (macOS and Linux are the CI matrix), but POSIX file-mode semantics don't translate cleanly to NTFS and we don't block the release on Windows edge cases.
- Plugin system for third-party formatters or source types.
- A standalone (Node-less) binary. npm + `npx` is the only distribution channel in v0.1.

## Decisions

### D1. TypeScript + Node 20 over Go

Considered: Go (single static binary, faster startup, no Node runtime dependency).

Chosen: **TypeScript 5.4+ on Node 20 LTS, ESM-only.** Reasons:

- `npx` is the advertised install path; the target audience (Node-adjacent devs + AI agents running in sandboxes that already have Node) gets zero-friction ad-hoc invocation.
- `@readme/openapi-parser` and `minisearch` are the best-in-class libraries for this problem and both are JS-native; a Go port would require reimplementing ref resolution and BM25.
- Authoring velocity with Claude Code on a TS codebase is materially higher than on Go for CLI surface work.
- Startup time of ~150–300ms is inside our budget. If we ever need faster, we can compile hot paths or rewrite, but the CLI contract is language-agnostic.

### D2. Commander over yargs / oclif / citty

Considered: `yargs` (more features), `oclif` (opinionated, batteries-included), `citty` (modern, UnJS-native).

Chosen: **`commander`.** Reasons:

- Mature, tree-shakable, strong TypeScript types.
- Lightweight — `oclif` ships a plugin system we don't need and `yargs` carries legacy weight.
- `citty` is nice but newer and less battle-tested; we'd trade ecosystem depth for aesthetics.

### D3. `@readme/openapi-parser` for parsing + ref resolution

Considered: `swagger-parser` (same lineage, older), `openapi-types` + manual resolution (more work, more control).

Chosen: **`@readme/openapi-parser`.** It's the maintained fork of `swagger-parser`, resolves all `$ref`s (internal and external), validates 3.0/3.1 against their JSON schemas, and normalizes common spec shapes. Downstream code (indexer, formatter) sees a fully-resolved spec and never chases pointers. Worth the dependency weight.

### D4. `minisearch` for BM25 over operations and schemas

Considered: `lunr` / `elasticlunr` (older, heavier), `flexsearch` (fast but opinionated tokenizer), `fuse.js` (fuzzy, not BM25 — worse for structured fields).

Chosen: **`minisearch`.** Reasons:

- BM25 with per-field weights matches how OpenAPI operations are structured (operationId + summary carry most signal).
- Index is serializable to JSON → caches cleanly on disk alongside the parsed spec.
- Small footprint (single dependency, ~50KB minified), pure JS, no native build.
- Recall is expected to be acceptable for OpenAPI specs (short, structured text). If users report poor recall, the embeddings escape hatch in Open Questions kicks in — no architectural change required.

**Field weights** (indexed per operation):

| Field | Weight |
|---|---|
| `operationId`, `summary` | high |
| `description`, `method`+`path` (path segments tokenized), `tags` | medium |
| parameter names+descriptions, request body schema name | low |

Schemas indexed on `name`, `description`, property names.

### D5. Cache layout: one directory per source, keyed by hash

Path: `~/.cache/apeek/<source-hash>/` (respects `XDG_CACHE_HOME`).

`source-hash` is `sha256(canonical-source-identifier)` truncated to 16 hex chars, where:

- For URL sources: `canonical = normalized URL` (lowercase scheme + host, stripped fragment, sorted query params).
- For file sources: `canonical = resolved absolute path`.

Each directory holds:

- `spec.json` — normalized, ref-resolved OpenAPI spec.
- `index.json` — serialized minisearch index.
- `meta.json` — `{ fetchedAt, ttlSeconds, etag, lastModified, specHash, apeekCacheSchemaVersion, nodeMajor }`.

Directory mode `0700`, file mode `0600` on POSIX (best-effort on Windows, documented).

Invalidation triggers: TTL expiry, ETag / Last-Modified mismatch on a conditional refetch, manual `source refresh`, `--refresh` flag, schema-version bump, Node-major bump.

**Why hash the source instead of using the alias?** Aliases are user-facing and rename-friendly; the cache key must be stable across renames and must not collide when two users share a machine with the same alias pointing at different URLs.

### D6. Config file with per-project overlay

Global: `~/.config/apeek/config.json` (respects `XDG_CONFIG_HOME`).
Per-project: `./.apeekrc.json` OR `./apeek.config.json` (first one found, never both) merged **over** global.

Schema versioned (`{ "version": 1, ... }`). Zod-validated on load. Failed validation → typed `ConfigError`, not a panic; the message points at the bad field.

Merge semantics: shallow merge at top level, deep merge inside `sources` (per-alias). Project can add new aliases, override `url` / `headers` / `cacheTtlSeconds` of an existing alias, and override `defaultSource`. Project **cannot** remove a global alias (remove by setting it to `null` is rejected — use `source remove` explicitly).

### D7. Env var interpolation at read time only

Header values containing `${VAR_NAME}` (or `${VAR_NAME:-default}`) are interpolated **only** when headers are handed to the fetcher. The raw `${...}` string is what the config file stores and what `config get` prints. `source info` redacts resolved values in its output.

If a referenced env var is unset and no default is provided, the fetch fails fast with a typed `MissingEnvError` naming the variable. We do **not** send an empty-valued header.

This means: no code path ever writes a resolved token to disk, and `--verbose` logs redact `Authorization` / `X-*-Token` / `Api-Key` header values by default.

### D8. Output channels and the `apeek output` module

Single rule enforced repo-wide: **stdout is for the result, stderr is for everything else.** Progress messages, warnings, debug logs, wizard prompts — all stderr. This keeps `apeek search ... | jq ...` and `apeek op ... > file.md` unambiguous.

All user-facing text routes through `src/cli/output.ts`, which exposes `stdout(...)`, `stderr(...)`, `debug(...)`, `warn(...)`, `error(...)`. Command handlers never call `console.log` directly. Formatters return strings; the output module decides where they go. `NO_COLOR` and `--no-color` are honored at this layer.

### D9. Typed error hierarchy in `src/lib/errors.ts`

Base `ApeekError` with subclasses: `ConfigError`, `SourceError`, `FetchError`, `ParseError`, `CacheError`, `AgentInstallError`, `MissingEnvError`, `NotFoundError` (for `op` / `schema` lookups that miss). Each carries a stable `code` string (e.g. `E_SOURCE_NOT_FOUND`), a human message, and an optional `hint`. The CLI entrypoint catches `ApeekError`, prints the code + message + hint to stderr, exits with a class-specific code (1 for user error, 2 for config/IO, 3 for network). Unexpected non-`ApeekError` throws become exit 99 with the stack dumped under `--verbose`.

No string-literal throws anywhere in the codebase. This is the single biggest discipline that keeps error UX predictable.

### D10. Agent integration: pluggable by file, detected by probe

`src/agents/` contains one module per supported agent plus `detect.ts` and `templates/`.

Each agent module exports:

```ts
export interface AgentIntegration {
  id: 'claude-code' | 'cursor' | 'codex' | 'windsurf' | 'continue';
  displayName: string;
  detect(): Promise<DetectResult>;
  install(opts: InstallOpts): Promise<InstallResult>;
}
```

`detect()` uses filesystem probes (check for `~/.claude/`, `.cursor/`, `~/.codex/`, etc.), not process scanning or OS-specific app-bundle lookups. The v0.1 MVP ships `claude-code.ts` and `cursor.ts`. Stub modules for `codex.ts`, `windsurf.ts`, `continue.ts` are committed returning `{ supported: false, reason: 'planned for v0.2' }` from `install()`, so the registry and `install` CLI surface are already complete.

`templates/` holds the frontmatter + body as plain files (`claude-code-skill.md`, `cursor-rule.mdc`, etc.), bundled by `tsup` via its static-asset loader. No network at setup time — the template ships with the binary.

The `setup` wizard uses `prompts` for interactive flows; `install <agent>` is the non-interactive equivalent that setup delegates to after all questions are answered. Non-interactive is the contract; interactive is a thin UX layer on top.

### D11. Autodiscovery: walk cwd → root, first match wins

Order inside each directory:

1. `openapi.json`, `openapi.yaml`, `openapi.yml`
2. `swagger.json`, `swagger.yaml`, `swagger.yml`
3. `docs/openapi.*`, `api/openapi.*` (same extension priority)

Walk direction: cwd, then each parent up to filesystem root. Stop at first hit. Found file registered as an **anonymous ephemeral source** (cache key hashed off absolute path, no entry in the config file).

If nothing found and no configured source exists and no `--source` flag was passed, fail with `SourceError` pointing at `apeek source add` / `apeek setup` / the `--source` flag.

### D12. No postinstall, explicit first-run

npm postinstall scripts are widely distrusted and slow on CI. We do nothing on install. First invocation without any config shows a one-screen welcome pointing at `apeek setup`, then exits 0. This is the only place `apeek` ever prints a non-error message without the user asking for one.

### D13. Naming: `apeek` (renamed from `oapi` during proposal)

The original proposal document used `oapi` throughout. The rename to `apeek` is the single place where our implementation deliberately diverges from the source spec document. Every identifier derived from the name flips: npm package `@spryx-ai/apeek`, binary `apeek`, XDG paths `apeek/`, skill id `apeek`, Cursor rule `apeek.mdc`, per-project files `.apeekrc.json` / `apeek.config.json`, cache dir `~/.cache/apeek/`, config dir `~/.config/apeek/`. No `oapi` string survives in code, config, docs, or templates.

### D14. Repository layout

```
apeek/
├── .github/workflows/
│   ├── ci.yml                  # lint + typecheck + test on PR (Node 20 + 22)
│   └── release.yml             # changesets publish on main
├── .changeset/config.json
├── src/
│   ├── cli/
│   │   ├── index.ts            # commander entrypoint, shebang, error boundary
│   │   ├── output.ts           # stdout/stderr/debug writers
│   │   └── commands/
│   │       ├── search.ts
│   │       ├── op.ts
│   │       ├── schema.ts
│   │       ├── source.ts       # add/list/use/remove/refresh/info
│   │       ├── config.ts       # get/set/path
│   │       ├── cache.ts        # clear
│   │       ├── setup.ts        # interactive wizard
│   │       └── install.ts      # non-interactive agent install
│   ├── core/
│   │   ├── source-manager.ts
│   │   ├── fetcher.ts
│   │   ├── parser.ts
│   │   ├── indexer.ts
│   │   ├── cache.ts
│   │   ├── autodiscovery.ts
│   │   └── formatter/
│   │       ├── index.ts        # format dispatcher
│   │       ├── markdown.ts
│   │       ├── json.ts
│   │       └── compact.ts
│   ├── config/
│   │   ├── schema.ts           # zod schemas
│   │   ├── loader.ts           # global + per-project merge
│   │   └── paths.ts            # XDG resolution (macOS/Linux/Windows)
│   ├── agents/
│   │   ├── detect.ts
│   │   ├── registry.ts         # agent id → module map
│   │   ├── claude-code.ts
│   │   ├── cursor.ts
│   │   ├── codex.ts            # v0.2 stub
│   │   ├── windsurf.ts         # v0.2 stub
│   │   ├── continue.ts         # v0.2 stub
│   │   └── templates/
│   │       ├── claude-code-skill.md
│   │       └── cursor-rule.mdc
│   ├── lib/
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   ├── env.ts              # ${VAR} interpolation
│   │   └── redact.ts           # header redaction for logs
│   └── types.ts
├── tests/
│   ├── fixtures/
│   │   ├── petstore.yaml
│   │   └── spryx-sample.json
│   ├── unit/
│   └── integration/
├── docs/
│   ├── ARCHITECTURE.md
│   └── AGENTS.md
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc
├── LICENSE
└── README.md
```

### D15. Build + test tooling

- **tsup** (esbuild) — single-file bundle, ESM, shebang injected, static assets (templates) inlined.
- **vitest** — native ESM/TS, fast watch, snapshot support for formatter tests.
- **eslint** (flat config) + **prettier** — standard TS rules, `no-console` enforced in `src/cli/commands/` and `src/core/` (must go through `output.ts`), `no-restricted-syntax` to ban string-throws.
- **changesets** — versioning + CHANGELOG + publish. `@spryx-ai` scope publish handled in release workflow with `NPM_TOKEN` secret.
- **npm** as package manager (`package-lock.json` committed). pnpm was considered but rejected to keep the toolchain minimal — no corepack prerequisite, no extra shim, and the `npm ci` path is well-supported in every CI runner and contributor environment. Switching to pnpm later is a lockfile migration, not a source change.

### D16. Performance engineering

Budget (from proposal): startup <150ms, cold search <3s on <100-op specs, warm search <300ms, warm `op` <200ms, 500-op index <15MB, peak memory <300MB during index build.

Tactics:

- **Lazy imports** of heavy deps (`@readme/openapi-parser`, `minisearch`, `js-yaml`) — only loaded when a command actually needs them. `apeek --version` and the first-run welcome touch none of them.
- **Warm-path avoids parser entirely** — on cache hit, we load `spec.json` (already normalized) and `index.json` (already serialized) directly. `@readme/openapi-parser` is only invoked on cache miss.
- **Baseline benchmarks** with `hyperfine` against `petstore.yaml` (small), a mid-size FastAPI-generated spec, and the Stripe OpenAPI spec (large). Baseline captured at v0.1 release; regressions fail CI once established (deferred gating until v0.1 ships and numbers stabilize — we don't want flaky gates from the start).

### D17. Scope decisions explicitly deferred in this change

- **`list` command** — cut. `search` with an empty/wildcard query covers the use case. Keeping it out means `openapi-query` has three commands instead of four, less formatter surface.
- **`doctor` command** — cut. It's nice-to-have diagnostic UX, not MVP. Re-adds in v0.2 land in `cli-foundation`.
- **Codex / Windsurf / Continue** — scaffolded (stub modules + ids in the registry + docs noting v0.2), not implemented. `setup` filters them out of the selection list in v0.1.
- **Embeddings search, MCP server mode, `diff`, federated search, plugin system** — listed in Open Questions.

## Risks / Trade-offs

- **[BM25 recall may disappoint on paraphrased queries]** → Field weights tuned for OpenAPI shape; if users report misses, the agent skill prompt explicitly says "rephrase with domain nouns" as a first recourse. Embeddings escape hatch (hosted API, not local models) reserved for post-1.0 if the problem is real.
- **[Startup latency breach from dependency load]** → Lazy imports required on any new dep; `apeek --version` acts as the canary in benchmarks. Every new dep added to `package.json` must note in its PR whether it's loaded on the cold path.
- **[Secrets leaking via `--verbose` logs or error messages]** → `src/lib/redact.ts` masks common secret headers (`Authorization`, `X-*-Token`, `Api-Key`, `Cookie`) everywhere the logger touches. Error messages include header names but never values.
- **[Windows POSIX-mode file perms don't translate]** → Best-effort on Windows, documented in README security section. Not gating v0.1 release on it.
- **[Bundle size growth from `@readme/openapi-parser` pulling ajv + the full JSON schema validators]** → Accepted for v0.1 — correctness > size for a dev tool. Measure at release; if bundle exceeds 5MB, revisit.
- **[Cache corruption from partial writes on crash]** → Write to `<file>.tmp` then atomic rename. On read, a JSON parse failure invalidates the cache entry and triggers refetch rather than propagating a CacheError to the user.
- **[Agent template drift from upstream agent format changes]** → Templates versioned alongside code; CI integration tests assert the installed file matches the expected template byte-for-byte. Breakage surfaces in CI, not in production user installs.
- **[Ref-resolution cycles in pathological specs causing parser to hang]** → `@readme/openapi-parser` handles cycles internally; we add a 30s parse timeout in `core/parser.ts` as a belt-and-suspenders guard, raising `ParseError` with a "spec is very large or has cyclic refs" hint.
- **[Node 18 users hitting `fetch` issues]** → `engines.node: ">=20"` is enforced in `package.json` and checked at CLI startup with a friendly error on older Node. We do not polyfill.
- **[`prompts` interactive flow breaking when stdin is not a TTY (CI, piped input)]** → `setup` detects non-TTY and errors out pointing at the non-interactive `install` + `source add` equivalents. Never silently prompts into the void.

## Migration Plan

Not applicable — this is the initial release. No prior `apeek` install exists to migrate from. The only "migration" is Spryx frontend team moving off the OpenAPI MCP server, which is tracked outside this change and requires only installing `apeek` + running `apeek setup`.

Rollback: if v0.1 ships and has a blocking bug, `npm deprecate @spryx-ai/apeek@0.1.0 "use 0.1.1"` and publish a patch. Users running via `npx @spryx-ai/apeek@latest` self-heal on next invocation.

## Open Questions

1. **Embeddings-based search as a fallback or replacement for BM25.** Deferred. Revisit if post-launch feedback shows recall problems on real specs. If added, a hosted embedding API (Voyage / OpenAI) keeps the bundle small; local models are rejected.
2. **MCP server mode.** Could `apeek` optionally expose itself as an MCP server for agents that prefer the protocol? Likely yes post-1.0, as a thin adapter over the existing core (`apeek serve --mcp`). Not blocking v0.1.
3. **`diff` command for spec versioning.** Nice for migration work (deprecated endpoints, breaking changes). Deferred.
4. **Federated multi-source search** (`apeek search "..." --sources a,b,c`). Deferred until we see a real use case where single-source + alias-switching isn't enough.
5. **Plugin system** for third-party formatters / source types. Unlikely needed before 1.0; adding it right later is cheaper than adding it wrong now.
6. **Homebrew / standalone binary distribution.** npm + `npx` only in v0.1. Revisit if adoption patterns justify the maintenance.
7. **Telemetry.** Currently zero. If we ever want adoption metrics, an opt-in anonymous counter (with `apeek config set telemetry.enabled true`) is the only acceptable shape. Not in v0.1.
