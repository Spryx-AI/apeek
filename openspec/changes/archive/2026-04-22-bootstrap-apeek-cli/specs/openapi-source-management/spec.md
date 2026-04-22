## ADDED Requirements

### Requirement: `source add` command

The system SHALL register a named OpenAPI source, accepting either an HTTP(S) URL or a filesystem path and optional per-source headers and cache TTL.

#### Scenario: Adding a remote source

- **WHEN** the user runs `apeek source add spryx https://api.spryx.ai/openapi.json`
- **THEN** the system persists an entry with alias `spryx`, URL, and an `addedAt` timestamp to the global config
- **AND** prints a confirmation to stderr
- **AND** exits with code 0

#### Scenario: Adding a local source

- **WHEN** the user runs `apeek source add local ./openapi.json`
- **THEN** the system persists an entry with alias `local` and `path` resolved to an absolute path to the global config

#### Scenario: Adding a source with a header

- **WHEN** the user runs `apeek source add spryx https://api.spryx.ai/openapi.json --header "Authorization=Bearer \${SPRYX_DOCS_TOKEN}"`
- **THEN** the persisted config stores the literal string `Bearer ${SPRYX_DOCS_TOKEN}` in the header value
- **AND** does NOT resolve `${SPRYX_DOCS_TOKEN}` at write time

#### Scenario: Duplicate alias rejected

- **WHEN** the user runs `apeek source add spryx <url>` and `spryx` already exists
- **THEN** the system prints an error pointing at `apeek source remove spryx` or a different alias
- **AND** exits with code 1
- **AND** the existing entry is unchanged

#### Scenario: Insecure HTTP URL rejected by default

- **WHEN** the user runs `apeek source add insecure http://example.com/openapi.json`
- **THEN** the system prints an error requiring HTTPS or the `--allow-insecure` flag
- **AND** exits with code 1

#### Scenario: Setting it as default on first add

- **WHEN** the user runs `apeek source add spryx <url>` and no sources were previously configured
- **THEN** the system sets `defaultSource` to `spryx` in the config

### Requirement: `source list` command

The system SHALL list all configured sources, marking the current default.

#### Scenario: Listing with a default set

- **WHEN** the user runs `apeek source list` and `defaultSource` is `spryx`
- **THEN** the output includes every configured alias with its URL or path
- **AND** the `spryx` entry is marked as default

#### Scenario: Listing with no sources configured

- **WHEN** the user runs `apeek source list` and no sources are configured
- **THEN** the system prints a message directing the user to `apeek source add` or `apeek setup`
- **AND** exits with code 0

### Requirement: `source use` command

The system SHALL set a configured alias as the default source.

#### Scenario: Switching default

- **WHEN** the user runs `apeek source use stripe` and `stripe` is configured
- **THEN** the system updates `defaultSource` to `stripe` in the global config
- **AND** subsequent query commands without `--source` resolve `stripe`

#### Scenario: Switching to unknown alias

- **WHEN** the user runs `apeek source use unknown` and no such alias exists
- **THEN** the system prints an error listing configured aliases
- **AND** exits with code 1
- **AND** `defaultSource` is unchanged

### Requirement: `source remove` command

The system SHALL remove a configured alias.

#### Scenario: Removing an alias

- **WHEN** the user runs `apeek source remove spryx` and `spryx` is configured
- **THEN** the system deletes the entry from the config
- **AND** deletes the cache directory associated with that source

#### Scenario: Removing the current default

- **WHEN** the user runs `apeek source remove <alias>` where `<alias>` equals `defaultSource`
- **THEN** the system removes the entry
- **AND** clears `defaultSource` (unset, not replaced)

### Requirement: `source refresh` command

The system SHALL bypass cache and refetch a source (or all sources), rebuilding its index.

#### Scenario: Refreshing one alias

- **WHEN** the user runs `apeek source refresh spryx`
- **THEN** the system refetches the spec, re-parses it, rebuilds the index, and writes a new cache entry
- **AND** prints a summary (operation count, schema count, fetch duration) to stderr

#### Scenario: Refreshing all sources

- **WHEN** the user runs `apeek source refresh` with no alias
- **THEN** the system refreshes every configured source in turn

### Requirement: `source info` command

The system SHALL print metadata about a configured source without leaking resolved secret values.

#### Scenario: Info for a source with auth headers

- **WHEN** the user runs `apeek source info spryx` and the source has an `Authorization: Bearer ${SPRYX_DOCS_TOKEN}` header
- **THEN** the output shows the header name and the literal `${SPRYX_DOCS_TOKEN}` reference
- **AND** does NOT print the resolved env var value

#### Scenario: Info for unknown alias

- **WHEN** the user runs `apeek source info unknown` and no such alias exists
- **THEN** the system prints an error listing configured aliases
- **AND** exits with code 1

### Requirement: `config get` command

The system SHALL read a config value by dotted path and print it to stdout.

#### Scenario: Reading a scalar

- **WHEN** the user runs `apeek config get defaultSource`
- **THEN** the system prints the value (e.g. `spryx`) to stdout

#### Scenario: Reading a non-existent key

- **WHEN** the user runs `apeek config get foo.bar` and no such key exists
- **THEN** the system prints nothing to stdout
- **AND** exits with code 1

### Requirement: `config set` command

The system SHALL write a config value by dotted path.

#### Scenario: Setting a scalar

- **WHEN** the user runs `apeek config set defaults.limit 10`
- **THEN** the config file contains `defaults.limit = 10`
- **AND** subsequent reads of that key return `10`

#### Scenario: Setting an invalid value

- **WHEN** the user runs `apeek config set defaults.limit not-a-number`
- **THEN** the system prints a validation error referencing the schema
- **AND** exits with code 1
- **AND** the config file is unchanged

### Requirement: `config path` command

The system SHALL print the filesystem path of the active global config file.

#### Scenario: Printing the path

- **WHEN** the user runs `apeek config path`
- **THEN** the system prints the absolute path to the global config file to stdout
- **AND** exits with code 0

### Requirement: Config file schema

The system SHALL persist configuration as JSON conforming to a versioned zod schema, validated on every read.

#### Scenario: Valid config loads

- **WHEN** the config file contains valid JSON matching schema version 1
- **THEN** the system loads it and proceeds

#### Scenario: Invalid config rejected

- **WHEN** the config file contains JSON that fails schema validation
- **THEN** the system prints an error naming the offending field and the expected type
- **AND** exits with code 2
- **AND** does NOT mutate the config file to "fix" it

#### Scenario: Malformed JSON

- **WHEN** the config file contains invalid JSON
- **THEN** the system prints an error referencing the parse failure
- **AND** exits with code 2

### Requirement: Config file location follows XDG

The system SHALL resolve the global config path as `$XDG_CONFIG_HOME/apeek/config.json`, falling back to `~/.config/apeek/config.json` when `XDG_CONFIG_HOME` is unset.

#### Scenario: XDG_CONFIG_HOME set

- **WHEN** `XDG_CONFIG_HOME=/custom/config` is set in the environment
- **THEN** the system reads and writes at `/custom/config/apeek/config.json`

#### Scenario: XDG_CONFIG_HOME unset

- **WHEN** `XDG_CONFIG_HOME` is unset
- **THEN** the system reads and writes at `$HOME/.config/apeek/config.json`

### Requirement: Per-project config overlay

The system SHALL merge a per-project config file (`./.apeekrc.json` or `./apeek.config.json`) over the global config at load time.

#### Scenario: Project overlay adds a source

- **WHEN** a project contains `.apeekrc.json` defining source `internal` not present globally
- **THEN** `apeek source list` run in that project includes `internal`
- **AND** the global config file is unchanged on disk

#### Scenario: Project overlay overrides default

- **WHEN** the global config has `defaultSource: spryx` and a project's `.apeekrc.json` has `defaultSource: internal`
- **THEN** `apeek search "foo"` run in that project resolves the `internal` source

#### Scenario: Both project files present

- **WHEN** both `./.apeekrc.json` and `./apeek.config.json` exist in the project
- **THEN** the system prints an error naming both files and demanding the user remove one
- **AND** exits with code 2

### Requirement: Environment variable interpolation in headers

The system SHALL interpolate `${VAR_NAME}` references in header values at the moment a fetch is issued, and never at config write time.

#### Scenario: Interpolation at fetch time

- **WHEN** a source has header `Authorization: Bearer ${SPRYX_DOCS_TOKEN}` and `SPRYX_DOCS_TOKEN=abc123` is set in the process environment
- **THEN** the outbound HTTP request carries `Authorization: Bearer abc123`
- **AND** the config file on disk still contains the literal `${SPRYX_DOCS_TOKEN}` string

#### Scenario: Missing env var

- **WHEN** a source references `${MISSING_TOKEN}` in a header and `MISSING_TOKEN` is unset
- **THEN** the system raises a `MissingEnvError` naming the variable
- **AND** exits with code 2
- **AND** does NOT send a request with an empty or literal `${...}` header value

#### Scenario: Default value syntax

- **WHEN** a header value contains `${VAR:-fallback}` and `VAR` is unset
- **THEN** the interpolated value is `fallback`

### Requirement: Autodiscovery

The system SHALL discover a local OpenAPI spec file when no source is configured and no `--source` flag is passed, by walking from the current working directory to the filesystem root.

#### Scenario: File found in cwd

- **WHEN** the cwd contains `openapi.json` and the user runs `apeek search "foo"` with no source configured
- **THEN** the system uses `./openapi.json` as an anonymous source
- **AND** caches it under a hash of its absolute path

#### Scenario: File found in parent directory

- **WHEN** `openapi.yaml` exists in a parent directory of cwd and no file exists in cwd or intermediate directories
- **THEN** the walk locates the parent-directory file and uses it

#### Scenario: Discovery precedence

- **WHEN** a directory contains both `openapi.json` and `swagger.json`
- **THEN** the system uses `openapi.json`

#### Scenario: Nothing found

- **WHEN** the walk reaches the filesystem root without finding any candidate file, no sources are configured, and no `--source` flag was passed
- **THEN** the system prints a `SourceError` with hints pointing at `apeek source add`, `apeek setup`, and the `--source` flag
- **AND** exits with code 1
