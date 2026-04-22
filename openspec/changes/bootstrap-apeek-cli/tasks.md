## 1. Scaffolding

- [x] 1.1 Run `npm init -y`, then edit `package.json` to set `name: "@spryx-ai/apeek"`, `type: "module"`, `engines.node: ">=20"`, `bin.apeek: "./dist/cli/index.js"`, `files: ["dist","README.md","LICENSE"]`
- [x] 1.2 Install runtime deps: `npm install commander @readme/openapi-parser minisearch zod kleur prompts js-yaml`
- [x] 1.3 Install dev deps: `npm install -D typescript tsup vitest eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier @changesets/cli @types/node @types/prompts @types/js-yaml`
- [x] 1.4 Write `tsconfig.json` (strict mode, ESM, Node 20 target, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] 1.5 Write `tsup.config.ts` targeting `src/cli/index.ts` → `dist/cli/index.js` with shebang, ESM, static-asset inlining for `src/agents/templates/`
- [x] 1.6 Write `vitest.config.ts` with coverage reporter, ESM-native
- [x] 1.7 Write `eslint.config.js` (flat config): strict TS rules, ban `console.*` in `src/cli/commands/` and `src/core/`, ban string-literal `throw`
- [x] 1.8 Write `.prettierrc`
- [x] 1.9 Initialize changesets (`npx changeset init`)
- [x] 1.10 Write skeleton `src/cli/index.ts` that prints `apeek --version` via commander and exits 0
- [x] 1.11 Keep existing `LICENSE` (MIT, already in repo) and stub `README.md` (full README written in task 8.1)
- [x] 1.12 Verify `npm run build && node dist/cli/index.js --version` prints the version
- [x] 1.13 Verify local CLI linking: `npm link && apeek --version`
- [x] 1.14 Commit: `chore: scaffold apeek project`

## 2. Foundations: errors, logging, config, env

- [x] 2.1 Implement `src/lib/errors.ts` — base `ApeekError` + subclasses (`ConfigError`, `SourceError`, `FetchError`, `ParseError`, `CacheError`, `AgentInstallError`, `MissingEnvError`, `NotFoundError`), each with `code`, `message`, optional `hint`
- [x] 2.2 Implement `src/lib/redact.ts` — mask values for `Authorization`, `X-*-Token`, `Api-Key`, `Cookie` headers
- [x] 2.3 Implement `src/cli/output.ts` — `stdout`, `stderr`, `debug`, `warn`, `error` writers; color gating on TTY + `NO_COLOR` + `--no-color` flag; no spinners on stdout
- [x] 2.4 Implement `src/lib/logger.ts` — verbose-aware logger feeding `output.ts`, redacts via `redact.ts`
- [x] 2.5 Implement `src/config/paths.ts` — XDG resolution for global config (`$XDG_CONFIG_HOME/apeek/` or `~/.config/apeek/`) and cache root (`$XDG_CACHE_HOME/apeek/` or `~/.cache/apeek/`), cross-platform
- [x] 2.6 Implement `src/config/schema.ts` — zod schemas for config v1: top-level `{ version, defaultSource?, sources, defaults }`, per-source `{ url? | path?, headers?, cacheTtlSeconds?, allowInsecure?, addedAt }`
- [x] 2.7 Implement `src/lib/env.ts` — parse `${VAR}` and `${VAR:-default}`; raise `MissingEnvError` when unset and no default
- [x] 2.8 Implement `src/config/loader.ts` — load global + optional project (`.apeekrc.json` XOR `apeek.config.json`), deep-merge per-alias, reject both-present case, zod-validate, leave env placeholders unresolved
- [x] 2.9 Implement `src/cli/index.ts` Node version check at startup (reject <20 with code 2)
- [x] 2.10 Implement exit-code mapping in the CLI error boundary (1 user / 2 config-IO / 3 network / 99 unexpected)
- [x] 2.11 Unit tests: errors (exit code mapping), redact, env (interpolation + missing + default), paths (XDG set/unset), loader (merge, both-files error, invalid schema, unknown fields)
- [x] 2.12 Commit: `feat: config, errors, output foundations`

## 3. Ingestion: fetch, parse, index, cache

- [x] 3.1 Implement `src/core/fetcher.ts` — local file reader (json/yaml/yml, reject other extensions), HTTP(S) via native `fetch`, per-source headers resolved via `env.ts` at call time, `If-None-Match` / `If-Modified-Since` when previous meta exists, HTTPS-by-default with `allowInsecure` opt-in
- [x] 3.2 Implement `src/core/parser.ts` — wrap `@readme/openapi-parser`, enforce 30s timeout, validate `openapi: 3.0.x | 3.1.x` (reject Swagger 2.0 and missing version), resolve all `$ref`s, normalize to internal `NormalizedSpec` type in `src/types.ts`
- [x] 3.3 Implement `src/core/indexer.ts` — minisearch over operations (weights: operationId/summary high; description, method, path segments, tags medium; params + request-body schema name low) and component schemas (name high, description medium, property names low); serialize to JSON
- [x] 3.4 Implement `src/core/cache.ts` — directory layout (`<cache-root>/<source-hash>/{spec,index,meta}.json`); source-hash = sha256 of canonical identifier (normalized URL or absolute path) truncated to 16 hex; meta includes `fetchedAt`, `ttlSeconds`, `etag?`, `lastModified?`, `specHash`, `cacheSchemaVersion`, `nodeMajor`
- [x] 3.5 Cache: TTL logic (default 3600 remote, unlimited local), ETag/Last-Modified invalidation on 200 vs 304, `--refresh` bypass, atomic writes via `<file>.tmp` + rename, corrupt-read treated as miss (no user-visible error)
- [x] 3.6 Cache: mode `0700` dirs / `0600` files on POSIX, best-effort on Windows, invalidate on `cacheSchemaVersion` or `nodeMajor` change
- [x] 3.7 Add `tests/fixtures/petstore.yaml` (small OpenAPI 3.0 spec) and `tests/fixtures/spryx-sample.json` (anonymized 3.1 subset with auth requirements, references, enums)
- [x] 3.8 Unit tests: fetcher (local found/missing/bad-extension, HTTP 200/401/timeout, HTTPS enforcement, header forwarding, redacted errors), parser (3.0 ok, 3.1 ok, Swagger 2.0 rejected, broken $ref, parse timeout), indexer (weight ordering, path-segment tokenization, schema indexing, serialize/deserialize roundtrip), cache (TTL fresh/expired, ETag roundtrip, `--refresh`, atomic write, corrupt-read refetch, schema-version bump invalidates, POSIX perms)
- [x] 3.9 Commit: `feat: openapi ingestion pipeline`

## 4. Formatting

- [x] 4.1 Implement `src/core/formatter/markdown.ts` — `renderSearch`, `renderOp`, `renderSchema` producing the structures required in `specs/output-formatting/spec.md` (h1/h2 hierarchy, tables, fenced code blocks, no TTY decorations)
- [x] 4.2 Implement `src/core/formatter/json.ts` — stable documented shape per spec (search: query/source/results; op: full operation payload; schema: name/description/properties/required)
- [x] 4.3 Implement `src/core/formatter/compact.ts` — one line per result for search, single-line summary for op/schema
- [x] 4.4 Implement `src/core/formatter/index.ts` — dispatcher on `--format`; reject invalid formats with exit 1
- [x] 4.5 Snapshot tests for each formatter against fixture results; verify no ANSI escapes in piped output; verify `NO_COLOR` and `--no-color` both disable color; verify omitted sections (no requestBody, no parameters, no description) don't emit empty headings
- [x] 4.6 Commit: `feat: markdown, json, compact formatters`

## 5. Query commands and autodiscovery

- [x] 5.1 Wire commander entrypoint in `src/cli/index.ts` with global flags `--source/-s`, `--format/-f`, `--limit/-l`, `--no-color`, `--verbose/-v`, `--refresh`; route through error boundary
- [x] 5.2 Implement `src/core/autodiscovery.ts` — walk cwd → root, extension precedence per spec, stop at first hit; return anonymous source descriptor (hash off absolute path, no config-file entry)
- [x] 5.3 Implement source resolution precedence in a shared helper: `--source` flag > env > `defaultSource` > autodiscovery; raise `SourceError` with hints when all fail
- [x] 5.4 Implement `src/cli/commands/search.ts` — query minisearch, apply `--limit` (default 5), dispatch to formatter, zero-results exits 0
- [x] 5.5 Implement `src/cli/commands/op.ts` — method case-insensitive match, literal path template match (including `{param}` placeholders), `NotFoundError` with `apeek search` hint on miss
- [x] 5.6 Implement `src/cli/commands/schema.ts` — case-sensitive match, `NotFoundError` with close-match suggestions (Levenshtein-like) on miss
- [x] 5.7 Implement `src/cli/commands/cache.ts` — `cache clear [<alias>]`, delete specific or all cache dirs, warn on unknown alias without failing
- [x] 5.8 Implement `version` command (and `--version` flag equivalence) reading bundled `package.json`, no other I/O
- [x] 5.9 Implement first-run welcome: when no config file exists and `apeek` is invoked with no command, print welcome pointing at `apeek setup` to stderr and exit 0
- [x] 5.10 Implement unknown-command handler: print suggestion to stderr and exit 1
- [x] 5.11 Integration tests: end-to-end `search` → `op` → `schema` against `petstore.yaml`; `--source=./fixtures/petstore.yaml` ad-hoc path; autodiscovery from nested cwd; extension precedence; walk stops at first hit; nothing-found error; `--refresh` forces refetch; `--format json` is parseable; compact single-line shape; zero-result search exits 0; `op` method case-insensitivity; `schema` case-sensitivity with Did-you-mean hint
- [x] 5.12 Commit: `feat: search, op, schema, autodiscovery, version, cache clear`

## 6. Source and config management

- [x] 6.1 Implement `src/core/source-manager.ts` — `add`, `list`, `use`, `remove`, `refresh`, `info`; writes through zod schema via loader; `remove` also deletes associated cache dir
- [x] 6.2 Implement `src/cli/commands/source.ts` subcommands wiring — `source add` accepts `--header key=value` (repeatable), `--ttl <seconds>`, `--allow-insecure`; first-added source auto-becomes `defaultSource`; duplicate alias rejected; http:// rejected unless `--allow-insecure`
- [x] 6.3 `source list`: mark default, include URL/path; empty state points at `apeek source add` / `apeek setup`
- [x] 6.4 `source use`: reject unknown alias with a list of valid ones
- [x] 6.5 `source remove`: delete entry; if removed alias was `defaultSource`, unset `defaultSource` (don't auto-pick a replacement); delete cache dir
- [x] 6.6 `source refresh`: single alias or all; bypass cache, refetch + reindex, print summary (operation/schema count, fetch duration) to stderr
- [x] 6.7 `source info`: print metadata with header values showing raw `${VAR}` placeholders (never resolved)
- [x] 6.8 Implement `src/cli/commands/config.ts` — `config get <dotted.path>`, `config set <dotted.path> <value>` (zod-validated, reject on schema violation without mutating disk), `config path` (print absolute path to stdout)
- [x] 6.9 Integration tests: full source lifecycle (add → list → use → refresh → info → remove); duplicate-alias rejection; http:// rejection and `--allow-insecure` opt-in; first-source auto-default; removing default unsets `defaultSource`; per-project `.apeekrc.json` overlay adds a source and overrides default without mutating global file; both project files present → exit 2; missing env var in header → `MissingEnvError`; `source info` never prints resolved secret; `config set` validation failure leaves disk unchanged
- [x] 6.10 Commit: `feat: source and config management`

## 7. Agent integrations

- [x] 7.1 Define `AgentIntegration` interface in `src/agents/registry.ts` (`id`, `displayName`, `detect()`, `install(opts)`) and a typed registry map
- [x] 7.2 Implement `src/agents/detect.ts` — filesystem probes per spec (Claude Code `~/.claude/`, Cursor `.cursor/` or `~/.cursor/`, Codex `~/.codex/`, Windsurf `.windsurfrules` or config dir, Continue `~/.continue/`)
- [x] 7.3 Write `src/agents/templates/claude-code-skill.ts` — frontmatter (`name: apeek`, description with specified triggers), body with `search`/`op`/`schema` workflow, 5-call limit, setup-fallback hint (inlined as TS template string rather than separate .md file — design deviation to avoid loader complexity across tsup + vitest)
- [x] 7.4 Write `src/agents/templates/cursor-rule.ts` — frontmatter (`alwaysApply: true`), body with commands + limits + setup-fallback hint
- [x] 7.5 Implement `src/agents/claude-code.ts` — install writes bundled template to `~/.claude/skills/apeek/SKILL.md` (global) or `./.claude/skills/apeek/SKILL.md` (project), mode 0644, overwrite with stderr note, parents created
- [x] 7.6 Implement `src/agents/cursor.ts` — install writes `.cursor/rules/apeek.mdc` (project default) or `~/.cursor/rules/apeek.mdc` (global)
- [x] 7.7 Implement `src/agents/stubs.ts` for codex/windsurf/continue as v0.2 stubs: `detect()` functional, `install()` raises `AgentInstallError` with "planned for v0.2" message
- [x] 7.8 Implement `src/cli/commands/install.ts` — `install <agent> [--scope=global|project]`, scope defaults to global, unknown agent exits 1 with list of valid ids
- [x] 7.9 Implement `src/cli/commands/setup.ts` — detect → prompt agent selection (only MVP agents offered; v0.2 listed in closing summary) → prompt install scope → optionally prompt source (alias, URL/path, optional auth header, TTL) → connection-test (fetch + parse + index, show op/schema counts) → if test fails, ask to save anyway → atomic write (all-or-nothing) → closing summary with next-step commands
- [x] 7.10 Non-TTY guard in `setup`: if `!process.stdin.isTTY`, print error directing to `install <agent>` + `source add` and exit 1
- [x] 7.11 Unit tests: registry (new agent registers and appears in `install` + `setup`), detect (each probe), template content assertions (frontmatter + body markers per spec), install write paths + overwrite behavior, v0.2 stubs return correct error
- [x] 7.12 Integration tests: `install claude-code --scope=global` writes to expected path; `install cursor --scope=project` writes `.cursor/rules/apeek.mdc`; `install codex` errors with v0.2 hint; non-TTY `setup` exits 1; offline install (no network) succeeds using bundled templates; installed file matches shipped template byte-for-byte (template-drift guard)
- [ ] 7.13 Manual verification: run `apeek install claude-code --scope=project` in this repo, confirm Claude Code loads the skill on next session; repeat for Cursor
- [ ] 7.14 Commit: `feat: agent integrations (Claude Code, Cursor) + setup wizard`

## 8. Release engineering and docs

- [ ] 8.1 Write `README.md` — install (`npx @spryx-ai/apeek@latest`), quickstart (`setup` or `source add` + `search`), command reference, agent-integration section, security posture note, Windows best-effort note, link to docs/
- [ ] 8.2 Write `docs/ARCHITECTURE.md` — component diagram + data flow summarized from design.md
- [ ] 8.3 Write `docs/AGENTS.md` — expanded guidance on how an agent should use apeek (mirrors skill template content but longer)
- [ ] 8.4 Write `.github/workflows/ci.yml` — Node 20 + 22 matrix, `npm ci`, `npm run lint && npm run typecheck && npm run test:run`, no network in integration tests (fixture-only)
- [ ] 8.5 Write `.github/workflows/release.yml` — `changesets/action@v1`, `NPM_TOKEN` secret, publishes under `@spryx-ai` scope on main
- [ ] 8.6 Configure `.changeset/config.json` — access public, base branch main, restricted updates
- [ ] 8.7 Establish performance baseline with `hyperfine`: `apeek --version` (startup), cold search on petstore, warm search, warm op; record numbers in `docs/ARCHITECTURE.md` but do NOT gate CI yet
- [ ] 8.8 Manual verification run against real-world specs: Stripe (large), GitHub (large 3.0), Spryx backend (authenticated), a FastAPI-generated spec (small); record timing and note any failures
- [ ] 8.9 Sanity check bundle: `npm run build && du -sh dist/` — note size, flag if >5MB for future review
- [ ] 8.10 Run end-to-end on a fresh temp directory: `npx <local-tarball> setup`, walk through wizard, run `apeek search` successfully
- [ ] 8.11 Create first changeset (`npx changeset`), pick minor bump, write release notes referencing this change
- [ ] 8.12 Verify npm publish dry-run: `npm publish --dry-run`
- [ ] 8.13 Publish `0.1.0` to npm (run `npx changeset publish` via the release workflow, or manually after merging the release PR)
- [ ] 8.14 Final commit: `chore: release 0.1.0`

## 9. Archive this change

- [ ] 9.1 Once `0.1.0` is shipped and validated against the Spryx backend, run `/opsx:archive bootstrap-apeek-cli` to sync specs from `openspec/changes/bootstrap-apeek-cli/specs/` into `openspec/specs/` and move the change to `openspec/changes/archive/`
