# openapi-query Specification

## Purpose
TBD - created by archiving change bootstrap-apeek-cli. Update Purpose after archive.
## Requirements
### Requirement: `search` command

The system SHALL provide a `search <query>` command that returns a ranked list of matching operations and schemas from the active source.

#### Scenario: Basic search returns ranked operations

- **WHEN** the user runs `apeek search "create a deal"` against a source containing an operation `POST /deals` with summary "Create a deal"
- **THEN** the output ranks that operation in position 1
- **AND** each result entry includes method, path, summary, tags, and a suggested follow-up command (`apeek op <method> <path>`)

#### Scenario: Default result limit

- **WHEN** the user runs `apeek search "foo"` without `--limit`
- **THEN** the system returns at most 5 results

#### Scenario: Custom limit

- **WHEN** the user runs `apeek search "foo" --limit 20`
- **THEN** the system returns at most 20 results

#### Scenario: Zero results

- **WHEN** a search returns no matches
- **THEN** the output reports zero results and exits with code 0
- **AND** the exit code is NOT a `NotFoundError`

#### Scenario: Source override

- **WHEN** the user runs `apeek search "refund" --source stripe`
- **THEN** the search runs against the `stripe` source regardless of the configured default

### Requirement: Weighted indexing

The system SHALL index operations and schemas into a BM25-style full-text index with per-field weights, so that matches on high-signal fields rank above matches on low-signal fields.

Field weights for operations:

| Field | Weight tier |
|---|---|
| `operationId`, `summary` | high |
| `description`, `method`, `path` (with path segments tokenized separately), `tags` | medium |
| parameter names and descriptions, request body schema name | low |

Field weights for schemas:

| Field | Weight tier |
|---|---|
| name | high |
| description | medium |
| property names | low |

#### Scenario: OperationId match outranks parameter match

- **WHEN** a source contains operation A with `operationId: createDeal` and operation B where `createDeal` appears only in a parameter description
- **AND** the user runs `apeek search "createDeal"`
- **THEN** operation A ranks above operation B

#### Scenario: Path segments tokenized

- **WHEN** an operation has path `/deals/{deal_id}/contacts`
- **AND** the user searches for `contacts`
- **THEN** the operation is a candidate match (path segment contributes to the index)

#### Scenario: Schema search

- **WHEN** the user runs `apeek search "payment intent"` against a source containing a component schema `PaymentIntent`
- **THEN** the `PaymentIntent` schema appears in results
- **AND** each schema result entry includes the schema name, description, and a suggested follow-up command (`apeek schema <name>`)

### Requirement: `op` command

The system SHALL provide an `op <method> <path>` command that returns the full details of a single operation.

#### Scenario: Existing operation

- **WHEN** the user runs `apeek op POST /deals` and the source defines `POST /deals`
- **THEN** the output includes: method, path, summary, description, tags, security requirements, parameters table (name, type, required, description), request body (media type, schema name, property table), response table (status code, schema, description), and an example request body if one is declared or can be derived from the schema

#### Scenario: Path with placeholders

- **WHEN** the user runs `apeek op GET /deals/{deal_id}` and the source defines that operation
- **THEN** the output is returned for the literal path template
- **AND** the system does NOT require the user to substitute a concrete value

#### Scenario: Method case-insensitive

- **WHEN** the user runs `apeek op post /deals` (lowercase method)
- **THEN** the system matches `POST /deals`

#### Scenario: Operation not found

- **WHEN** the user runs `apeek op DELETE /nonexistent`
- **THEN** the system raises a `NotFoundError` stating no operation matches that method+path
- **AND** includes a hint suggesting `apeek search` to discover related operations
- **AND** exits with code 1

### Requirement: `schema` command

The system SHALL provide a `schema <name>` command that returns the full definition of a single component schema.

#### Scenario: Existing schema

- **WHEN** the user runs `apeek schema Deal` and the source defines a component schema named `Deal`
- **THEN** the output includes the schema name, description, and a property table (name, type, required, description, format/constraints)
- **AND** nested object properties are expanded inline (already ref-resolved)

#### Scenario: Schema with enum values

- **WHEN** a schema property is an enum
- **THEN** its enum values appear in the property's description column

#### Scenario: Schema not found

- **WHEN** the user runs `apeek schema Unknown`
- **THEN** the system raises a `NotFoundError` stating no schema matches
- **AND** includes a hint suggesting `apeek search` to discover available schemas
- **AND** exits with code 1

#### Scenario: Schema name case-sensitive

- **WHEN** the user runs `apeek schema deal` and the source defines `Deal` (capitalized)
- **THEN** the system raises a `NotFoundError`
- **AND** the hint includes a suggestion of close matches (e.g. `Did you mean: Deal?`)

