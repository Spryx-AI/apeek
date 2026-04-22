# Test fixtures

| File | Source | Notes |
|---|---|---|
| `petstore.yaml` | Authored for apeek | OpenAPI 3.0.3, 3 operations, 3 schemas. Exercises refs, enums, path params. |
| `spryx-sample.json` | Authored for apeek | OpenAPI 3.1.0, 3 operations, 4 schemas. Anonymized sample with security requirements. |
| `openai-openapi.yaml` | [openai/openai-openapi @ 2025-03-21](https://github.com/openai/openai-openapi/tree/2025-03-21) (MIT-licensed) | OpenAPI 3.0.0, 126 operations, 436 schemas — a real-world third-party spec used to exercise the CLI against production-scale input (search, op, schema detail, no OOM or timeout). Pinned to the `2025-03-21` branch snapshot. |

Fixtures are not shipped in the published npm tarball (only `dist/`, `README.md`, `LICENSE` per `package.json#files`).
