export const claudeCodeSkill = `---
name: apeek
description: >-
  Queries OpenAPI specifications for HTTP APIs via the apeek CLI. Use this skill
  whenever the user asks about HTTP endpoints, request/response schemas, API
  authentication, or how to call a specific API — whether it's the project's own
  backend or a third-party API (Stripe, WhatsApp, Supabase, etc.).

  Always use this skill before answering API-related questions. Your training
  data may not reflect the current state of the API, and reading the raw
  openapi.json consumes far more context than a targeted apeek query.

  Triggers: "how do I call X", "what does endpoint Y return", "what's the
  schema for Z", "which endpoint does W", any mention of specific HTTP methods
  + paths, any request to write code that calls an API.
---

# apeek — OpenAPI Context Lookup

Query OpenAPI specs for any registered source via the \`apeek\` CLI.

## Workflow

Three main commands:

\`\`\`bash
apeek search "<natural language question>"    # Find relevant operations
apeek op <METHOD> <path>                       # Full details of one operation
apeek schema <ComponentName>                   # Full schema definition
\`\`\`

Always run \`search\` first to discover relevant operations, then \`op\` for
details on the most promising result.

## Examples

\`\`\`bash
apeek search "create a payment"
apeek op POST /payment_intents
apeek schema PaymentIntent
\`\`\`

## Sources

If the project has multiple APIs, list registered sources:

\`\`\`bash
apeek source list
\`\`\`

Switch source for one query with \`-s <alias>\`:

\`\`\`bash
apeek search "refund" -s stripe
apeek search "refund" -s spryx
\`\`\`

## Limits

- Do not invoke apeek more than 5 times for a single user question.
- If the first two searches don't find what you need, rephrase with different
  keywords (domain nouns, not verbs like "create" alone).
- If apeek is not installed or no source is configured, tell the user to run
  \`npx @spryx/apeek@latest setup\` and stop. Do not try to work around it.

## Common mistakes

- Don't query with single words ("auth"). Use descriptive phrases.
- Don't assume the spec matches what you remember from training data. Always
  verify with a fresh query.
- The \`op\` command needs exact method + path including path parameters like
  \`{deal_id}\`, not concrete values.
`;
