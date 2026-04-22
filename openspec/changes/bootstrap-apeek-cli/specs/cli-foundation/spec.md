## ADDED Requirements

### Requirement: CLI entrypoint

The system SHALL expose a single executable named `apeek` that parses command-line arguments and dispatches to the appropriate command handler.

#### Scenario: Invoking with no arguments shows help

- **WHEN** the user runs `apeek` with no arguments
- **THEN** the system prints the top-level help listing available commands to stdout and exits with code 0

#### Scenario: Invoking an unknown command

- **WHEN** the user runs `apeek nonexistent-command`
- **THEN** the system prints an error naming the unknown command and suggesting `apeek --help` to stderr
- **AND** exits with code 1

#### Scenario: Binary is invocable via npx

- **WHEN** a user runs `npx @spryx-ai/apeek@latest --version`
- **THEN** the system prints the current package version and exits with code 0

### Requirement: Global flags on query commands

The system SHALL accept the following global flags on every query command (`search`, `op`, `schema`):

| Flag | Short | Purpose |
|---|---|---|
| `--source` | `-s` | Override the active source alias for this invocation |
| `--format` | `-f` | Output format: `markdown` (default), `json`, or `compact` |
| `--limit` | `-l` | Maximum number of results (applies to `search`) |
| `--no-color` | | Disable ANSI color in output |
| `--verbose` | `-v` | Emit debug logging to stderr |
| `--refresh` | | Bypass cache and refetch the source |

#### Scenario: Flag overrides configured default

- **WHEN** the user runs `apeek search "foo" --source stripe` while `defaultSource` is `spryx`
- **THEN** the system resolves the `stripe` source and ignores `spryx` for this invocation

#### Scenario: Invalid format value

- **WHEN** the user passes `--format xml`
- **THEN** the system prints an error naming the invalid value and listing valid formats to stderr
- **AND** exits with code 1

#### Scenario: Negative limit value

- **WHEN** the user passes `--limit -3`
- **THEN** the system prints a validation error to stderr
- **AND** exits with code 1

### Requirement: `version` command

The system SHALL provide a `version` command that prints the currently installed package version and exits without side effects.

#### Scenario: Version command prints semver

- **WHEN** the user runs `apeek version`
- **THEN** the system prints a semver string (e.g. `0.1.0`) to stdout
- **AND** exits with code 0
- **AND** performs no filesystem or network I/O beyond reading the bundled `package.json`

#### Scenario: `--version` flag is equivalent

- **WHEN** the user runs `apeek --version`
- **THEN** the output and exit code match `apeek version`

### Requirement: `cache clear` command

The system SHALL provide a `cache clear [<alias>]` command that removes cached spec and index data.

#### Scenario: Clearing a specific alias

- **WHEN** the user runs `apeek cache clear spryx` and the `spryx` source has cached data
- **THEN** the system deletes the cache directory for the `spryx` source
- **AND** prints a confirmation message to stderr
- **AND** exits with code 0

#### Scenario: Clearing all caches

- **WHEN** the user runs `apeek cache clear` with no alias
- **THEN** the system deletes all cache directories under the cache root
- **AND** prints a confirmation message to stderr
- **AND** exits with code 0

#### Scenario: Clearing a non-existent alias

- **WHEN** the user runs `apeek cache clear unknown-alias`
- **THEN** the system prints a warning that the alias has no cache to clear
- **AND** exits with code 0

### Requirement: First-run welcome message

The system SHALL print a welcome message pointing at `apeek setup` when it is invoked with no command and no configuration has ever been written.

#### Scenario: First-run invocation

- **WHEN** no config file exists at the global config path, no per-project config file exists, and the user runs `apeek` with no arguments
- **THEN** the system prints a welcome message referencing `apeek setup` and `apeek source add` to stderr
- **AND** exits with code 0

#### Scenario: Not first-run

- **WHEN** a config file exists at the global config path and the user runs `apeek` with no arguments
- **THEN** the system prints the top-level help instead of the welcome message

### Requirement: Output channel discipline

The system SHALL emit command result data on stdout and all other output (progress, warnings, errors, debug, prompts) on stderr.

#### Scenario: Piping search results

- **WHEN** the user runs `apeek search "foo" --format json > results.json 2> log.txt`
- **THEN** `results.json` contains only the JSON result
- **AND** `log.txt` contains any progress or warning messages, or is empty

#### Scenario: Verbose logs on stderr

- **WHEN** the user runs `apeek search "foo" --verbose > out.md`
- **THEN** `out.md` contains only the markdown result
- **AND** verbose debug output appears on the terminal's stderr

### Requirement: Typed error exit codes

The system SHALL map error categories to stable exit codes so scripts and agents can differentiate failure modes.

| Error category | Exit code |
|---|---|
| Success | 0 |
| User error (bad args, not found) | 1 |
| Config or I/O error | 2 |
| Network / fetch error | 3 |
| Unexpected internal error | 99 |

#### Scenario: User-error exit code

- **WHEN** a command fails because of a missing required argument
- **THEN** the process exits with code 1

#### Scenario: Network-error exit code

- **WHEN** a fetch fails because the remote host is unreachable
- **THEN** the process exits with code 3
- **AND** the error message on stderr names the URL and the underlying failure reason

#### Scenario: Unexpected-error stack trace

- **WHEN** an uncaught non-`ApeekError` exception reaches the CLI boundary and `--verbose` is set
- **THEN** the process prints the stack trace to stderr
- **AND** exits with code 99

### Requirement: Node version enforcement

The system SHALL require Node.js 20 or later at runtime.

#### Scenario: Running on unsupported Node

- **WHEN** the user runs `apeek` under Node 18
- **THEN** the system prints an error naming the current Node version and the minimum required version to stderr
- **AND** exits with code 2
- **AND** performs no other work
