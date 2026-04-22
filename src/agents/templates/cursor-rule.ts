export const cursorRule = `---
alwaysApply: true
---

Use the \`apeek\` CLI to query OpenAPI specifications whenever the user asks about
HTTP endpoints, request/response schemas, or how to call an API. This applies
to the project's own backend and third-party APIs alike.

## Commands

- \`apeek search "<question>"\` — find relevant operations
- \`apeek op <METHOD> <path>\` — full details of one operation
- \`apeek schema <Name>\` — component schema

## Rules

- Search before answering API questions. Do not rely on training data.
- Use descriptive queries, not single words.
- Max 5 apeek calls per user question.
- If \`apeek\` is not installed, tell the user: \`npx @spryx/apeek@latest setup\`.

For multiple sources, pass \`--source <alias>\` or see \`apeek source list\`.
`;
