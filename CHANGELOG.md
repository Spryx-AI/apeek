# @spryx/apeek

## 0.3.0

### Minor Changes

Agent-focused output improvements. **Note for consumers parsing markdown output:** the search result no longer emits a `Relevance: <score>` line, and the op response list now renders the schema name (`` `Deal` ``) in place of the primitive type (`object`). JSON output shape is unchanged.

- **Drop `Relevance: <score>` from markdown search output.** BM25 raw scores are noise for agents — the ranking is already applied. Removing saves tokens per result. (Scores remain in `--format json` since the shape contract documents them.)
- **Surface component schema names on responses and request bodies.** After `@readme/openapi-parser` dereferences `$ref`s, the resolved objects are the same references that live under `components/schemas`. We now build a reverse map and thread it through parse so the normalized schema carries its original name. The op formatter prints `` - **201** `Deal` — Created `` instead of `- **201** object — Created`, and the request body section starts with `` Schema: `DealCreate` `` when there's a name. Response arrays also handle the `T[]` shorthand when the items are a named component.
- **Render `oneOf` / `anyOf` / `allOf` composition on request bodies.** Instead of emitting an empty `## Request body` section for composed schemas (e.g. OpenAI's `CreateChatCompletionRequest`), the formatter now prints `One of: \`VariantA\` | \`VariantB\`` and a follow-up `Drill into a variant: \`apeek schema VariantA\`` line. `SchemaInfo` gains optional `oneOf` / `anyOf` / `allOf` arrays accordingly.
- **Skip empty `Tags:` / `Auth:` lines** in search and op output rather than rendering `Tags: —` or `Auth: none` placeholders.
- **Better cyclic-reference markers.** When the cycle closes at a named component (e.g. `Conversation → Message → Conversation`), the marker now reads `[cyclic reference — see schema Conversation]` and populates `SchemaInfo.name`, so the agent can drill in rather than staring at an opaque `[cyclic reference]`.

## 0.2.1

### Patch Changes

- Fix stack overflow when parsing specs with cyclic schemas (e.g. `Conversation` ↔ `Message`). `toSchemaInfo` now tracks the current recursion path and emits `{ description: "[cyclic reference]" }` when it re-enters an ancestor schema. Surfaced by the Spryx backend's real spec.
- Treat ad-hoc `--source https://…/openapi.json` flags as URL sources instead of misrouting them through the filesystem branch because of the `.json` extension. Also accepts `file://…` and explicitly rejects plain `http://` at the flag site (use `apeek source add --allow-insecure` instead).
- Added cycle-detection and URL-flag tests to guard against regressions.

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
