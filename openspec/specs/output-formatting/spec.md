# output-formatting Specification

## Purpose
TBD - created by archiving change bootstrap-apeek-cli. Update Purpose after archive.
## Requirements
### Requirement: Format selection

The system SHALL support three output formats for query commands — `markdown`, `json`, and `compact` — selectable via the `--format` flag, with `markdown` as the default.

#### Scenario: Default format is markdown

- **WHEN** the user runs `apeek search "foo"` without `--format`
- **THEN** the output is markdown

#### Scenario: Explicit json

- **WHEN** the user runs `apeek search "foo" --format json`
- **THEN** the output is a valid JSON payload parseable by a standard JSON parser

#### Scenario: Explicit compact

- **WHEN** the user runs `apeek search "foo" --format compact`
- **THEN** the output contains one line per result

#### Scenario: Invalid format

- **WHEN** the user runs `apeek search "foo" --format xml`
- **THEN** the system prints an error naming the invalid format and the valid options
- **AND** exits with code 1

### Requirement: Markdown format structure for `search`

The system SHALL produce markdown search output with a predictable, agent-friendly structure:

- An `h1` heading `# Search results: "<query>"`
- A `Source: <alias> (<url-or-path>)` line
- A `Results: <n>` line
- One `h2` section per result: `## <index>. <METHOD> <path> — <summary>`
- Each result section contains: description (if present), `Tags: ...`, `Auth: ...` (if security is declared), `Relevance: <score>`, and a `Get details: \`apeek op <METHOD> <path>\`` suggestion
- Blank lines separating sections
- No ASCII-art borders, banners, or TTY-only decoration

#### Scenario: Two-result markdown output

- **WHEN** a search returns two operation results
- **THEN** the output contains an `h1`, the `Source` and `Results` metadata lines, and exactly two `h2` sections

#### Scenario: Schema result in search

- **WHEN** a search returns a schema result
- **THEN** the result's heading takes the form `## <index>. schema <Name>`
- **AND** the `Get details` suggestion is `\`apeek schema <Name>\``

### Requirement: Markdown format structure for `op`

The system SHALL produce markdown operation output with an `h1` heading `# <METHOD> <path>`, followed by:

- Bold-labeled scalar fields: `**Summary:**`, `**Tags:**`, `**Auth:**`
- An `h2 Request body` section (omitted if the operation has no request body), naming the schema and including a property table
- An `h2 Parameters` section (omitted if none), with a table of name, type, required, description
- An `h2 Responses` section, listing status codes with their schema references and descriptions
- An `h2 Example request` section with a fenced code block in the declared or canonical media type

#### Scenario: Operation with body and parameters

- **WHEN** an operation has both parameters and a request body
- **THEN** the output includes both `## Parameters` and `## Request body` sections

#### Scenario: Operation without body

- **WHEN** an operation has no `requestBody`
- **THEN** the output omits the `## Request body` section entirely (does not emit an empty heading)

#### Scenario: Responses table

- **WHEN** an operation declares responses `201`, `400`, `404`
- **THEN** the `## Responses` section lists each status code with its associated schema name (if any) and description

### Requirement: Markdown format structure for `schema`

The system SHALL produce markdown schema output with an `h1` heading `# schema <Name>`, the schema's description (if present), and a property table with columns: name, type, required, description.

#### Scenario: Schema with nested object

- **WHEN** a schema has a property whose type is an object
- **THEN** the nested object's properties appear inline in the description column or as a clearly labeled sub-table

#### Scenario: Schema without description

- **WHEN** a schema has no `description` field
- **THEN** the output omits the description line rather than emitting an empty paragraph

### Requirement: JSON format structure

The system SHALL produce JSON output with a stable documented shape that programmatic consumers can rely on across patch releases.

`search`:

```json
{
  "query": "...",
  "source": { "alias": "...", "location": "..." },
  "results": [
    { "kind": "operation", "method": "...", "path": "...", "summary": "...", "tags": [...], "score": 0.94 },
    { "kind": "schema", "name": "...", "description": "...", "score": 0.81 }
  ]
}
```

`op`:

```json
{
  "method": "...", "path": "...", "summary": "...", "tags": [...],
  "security": [...], "parameters": [...], "requestBody": {...}, "responses": {...},
  "example": {...}
}
```

`schema`:

```json
{ "name": "...", "description": "...", "properties": {...}, "required": [...] }
```

#### Scenario: JSON is parseable

- **WHEN** the system emits `--format json` output
- **THEN** the entire stdout is a single parseable JSON value

#### Scenario: JSON shape stability

- **WHEN** the same command is run against the same source across two patch releases of `apeek`
- **THEN** any consumer reading documented top-level fields continues to work

### Requirement: Compact format structure

The system SHALL produce compact output with one line per result for `search`, and a single-line summary for `op` and `schema`.

#### Scenario: Compact search line

- **WHEN** the user runs `apeek search "foo" --format compact`
- **THEN** each result is rendered as `<METHOD> <path> — <summary>` (or `schema <Name> — <description>` for schema results)
- **AND** no blank lines, no headings, no metadata prefix appear

### Requirement: Color output

The system SHALL emit ANSI color only when stdout is a TTY, and SHALL disable color when `NO_COLOR` is set in the environment or `--no-color` is passed.

#### Scenario: Piped stdout

- **WHEN** the user pipes `apeek search "foo"` to another process
- **THEN** the output contains no ANSI escape sequences

#### Scenario: NO_COLOR env var

- **WHEN** `NO_COLOR=1` is set and stdout is a TTY
- **THEN** the output contains no ANSI escape sequences

#### Scenario: `--no-color` flag

- **WHEN** the user passes `--no-color` and stdout is a TTY
- **THEN** the output contains no ANSI escape sequences

### Requirement: No TTY decorations in non-interactive output

The system SHALL not emit spinners, progress bars, cursor-movement escape codes, or any other TTY-only visual elements on stdout.

#### Scenario: No spinner on stdout

- **WHEN** a command takes several seconds to complete
- **THEN** the stdout output contains no spinner characters or cursor-control sequences at any point
- **AND** any progress indication appears on stderr only, and only when stderr is a TTY

