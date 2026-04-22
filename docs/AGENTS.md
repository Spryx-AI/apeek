# Using apeek from an AI coding agent

`apeek` is designed for AI coding agents to invoke on demand when a user asks about an API. This guide mirrors the content of the skills it installs, expanded for the agent author perspective.

## When to invoke

Invoke `apeek` before answering any question where the answer depends on the current shape of an HTTP API — the project's own backend, a third-party API (Stripe, WhatsApp, Supabase, etc.), or a client's API that the user is integrating with.

Trigger cases:

- "How do I call X" / "What endpoint does Y"
- "What's the schema for Z"
- "What does endpoint W return"
- Any mention of a specific HTTP method + path
- Any request to write code that calls an API

Training data is stale. Specs change. Prefer a fresh `apeek` query over recalling what you "know" about the API.

## The three commands

```bash
apeek search "<natural language question>"   # find relevant operations
apeek op <METHOD> <path>                      # full detail of one operation
apeek schema <ComponentName>                  # full schema definition
```

**Workflow:** `search` first to discover, then `op` for the most promising candidate, then `schema` for any referenced types you need.

### `search`

- Use descriptive phrases, not single words. "auth" is a bad query; "authenticate with bearer token" or "create API key" is good.
- Domain nouns beat verbs. "list pets" works; "create" alone is too generic.
- Results are ranked by BM25 over operationId/summary (high), description/method/path/tags (medium), parameters/request-body-schema (low), and for schemas: name (high), description (medium), property names (low).
- Output includes a `Get details: apeek op ...` suggestion per result — follow it.

### `op`

- Method is case-insensitive (`POST` == `post`).
- Path is the literal template from the spec, including `{param}` placeholders. Pass `apeek op GET /deals/{deal_id}`, not a concrete value.
- Missing operations return `E_NOT_FOUND` (exit 1) with a hint pointing at `apeek search`.

### `schema`

- Name is case-sensitive. `apeek schema Deal` ≠ `apeek schema deal`.
- Close-match suggestions appear in the error hint on miss.

## Output formats

Default is `markdown` (agent-optimized: predictable sections, property tables, no ANSI, no spinners). Switch per call:

```bash
apeek search "..." --format json     # programmatic consumption
apeek search "..." --format compact  # tight context budget
```

## Multiple sources

```bash
apeek source list              # see configured sources, default marked *
apeek search "refund" -s stripe
apeek search "refund" -s spryx
```

## Invocation discipline

- **Max 5 calls per user question.** More usually means the wrong query, not a missing endpoint.
- **Rephrase with different nouns** if the first two searches don't find it.
- **Don't retry** a failed search verbatim. Change the query.

## When apeek isn't installed

If `apeek` isn't on the PATH, tell the user:

```
npx @spryx/apeek@latest setup
```

Then stop. Don't try to work around it, don't try to read `openapi.json` manually — the whole point of `apeek` is avoiding the token cost of that approach.

## Exit codes

| | |
|---|---|
| 0 | success (including zero search results) |
| 1 | user error — not found, bad args, unknown alias |
| 2 | config or I/O error |
| 3 | network / fetch error |
| 99 | unexpected internal error |

Errors print as `<CODE>: <message>` on stderr, followed by `  hint: <hint>` when applicable. Parse the code, not the message — codes are stable across patch releases.

## JSON format contract

`--format json` for `search` returns:

```json
{
  "query": "...",
  "source": { "alias": "...", "location": "..." },
  "results": [
    { "kind": "operation", "method": "POST", "path": "/deals",
      "operationId": "createDeal", "summary": "...", "tags": [...], "score": 0.94 },
    { "kind": "schema", "name": "Deal", "description": "...", "score": 0.81 }
  ]
}
```

`op` returns the full operation payload; `schema` returns `{ name, description, type, properties, required, enum }`. These top-level fields are stable across patch releases.

## Common mistakes

- Asking for a concrete path (`GET /deals/abc123`) when the spec uses `{deal_id}`. Use the template.
- Querying with single words. Use phrases.
- Treating `schema` as case-insensitive. It isn't; check the error's did-you-mean hint.
- Running more than 5 searches. Stop and rephrase.
- Trying to use `apeek` to actually call the API. It doesn't; it's a lookup tool only.
