# agent-integration Specification

## Purpose
TBD - created by archiving change bootstrap-apeek-cli. Update Purpose after archive.
## Requirements
### Requirement: Agent detection

The system SHALL detect installed AI coding agents by probing for well-known filesystem paths without scanning processes or OS-specific application bundles.

| Agent | Detection probe |
|---|---|
| Claude Code | `~/.claude/` directory exists |
| Cursor | `.cursor/` directory exists in cwd OR `~/.cursor/` exists |
| Codex | `~/.codex/` directory exists |
| Windsurf | `.windsurfrules` exists in cwd OR Windsurf config dir exists |
| Continue | `~/.continue/` directory exists |

#### Scenario: Claude Code detected

- **WHEN** `~/.claude/` exists on the filesystem and the user runs `apeek setup`
- **THEN** the wizard lists Claude Code as detected

#### Scenario: Agent not installed

- **WHEN** none of Codex's known paths exist
- **THEN** the wizard reports Codex as not detected
- **AND** does NOT offer to install its integration

#### Scenario: Detection is idempotent

- **WHEN** `apeek setup` is run twice in succession without any agent installs or uninstalls between runs
- **THEN** both runs report the same detection results

### Requirement: Supported agents in v0.1

The system SHALL fully support installation of skill/rule files for **Claude Code** and **Cursor** in v0.1.

#### Scenario: Claude Code install succeeds

- **WHEN** the user runs `apeek install claude-code --scope=global` and `~/.claude/` exists
- **THEN** the system writes `~/.claude/skills/apeek/SKILL.md` with the Claude Code skill template
- **AND** the file mode is `0644`
- **AND** exits with code 0

#### Scenario: Cursor install succeeds

- **WHEN** the user runs `apeek install cursor --scope=project` from a project root
- **THEN** the system writes `.cursor/rules/apeek.mdc` with the Cursor rule template
- **AND** exits with code 0

### Requirement: Unsupported agents in v0.1

The system SHALL expose `codex`, `windsurf`, and `continue` as known agent ids but return an `AgentInstallError` with a "planned for v0.2" message when `install` is invoked for them.

#### Scenario: Install attempt on v0.2 agent

- **WHEN** the user runs `apeek install codex`
- **THEN** the system prints an error stating the agent is planned for v0.2 and not yet implemented
- **AND** exits with code 1
- **AND** does NOT write any files

#### Scenario: `setup` excludes v0.2 agents from selection

- **WHEN** `apeek setup` displays the agent-selection prompt
- **THEN** the list offered for selection includes only Claude Code and Cursor
- **AND** Codex / Windsurf / Continue are listed in the wizard's closing output under "available in v0.2"

### Requirement: `install <agent>` non-interactive mode

The system SHALL provide an `install <agent>` command that installs a single agent's integration without any interactive prompts, supporting `--scope=global` or `--scope=project`.

#### Scenario: Global scope

- **WHEN** the user runs `apeek install claude-code --scope=global`
- **THEN** the skill file is written under the user's home directory (`~/.claude/skills/apeek/SKILL.md`)

#### Scenario: Project scope

- **WHEN** the user runs `apeek install claude-code --scope=project` from a project root
- **THEN** the skill file is written to `./.claude/skills/apeek/SKILL.md`

#### Scenario: Missing scope flag defaults

- **WHEN** the user runs `apeek install claude-code` without `--scope`
- **THEN** the system defaults to `--scope=global`

#### Scenario: Overwriting existing install

- **WHEN** the target file already exists from a previous install
- **THEN** the system overwrites the file
- **AND** prints a message to stderr noting the overwrite

#### Scenario: Unknown agent id

- **WHEN** the user runs `apeek install unknown-agent`
- **THEN** the system prints an error listing valid agent ids
- **AND** exits with code 1

### Requirement: `setup` interactive wizard

The system SHALL provide a `setup` command that runs an interactive wizard for first-time configuration, using `prompts` for user input on stderr.

The wizard SHALL:

1. Detect installed agents.
2. Ask which detected agents to integrate with.
3. For each selected agent, ask the install scope (global vs project) where applicable.
4. Optionally ask the user to configure a default source (URL or path, optional auth headers).
5. If a source is configured, perform a connection test (fetch + parse + index) and report operation/schema counts.
6. Write all selected integrations and the new source atomically — either all succeed or none are written.

#### Scenario: Complete wizard run

- **WHEN** the user runs `apeek setup`, selects Claude Code + Cursor, selects global scope for Claude Code, and configures a valid source
- **THEN** the system writes the Claude Code skill to `~/.claude/skills/apeek/`, writes the Cursor rule to `.cursor/rules/apeek.mdc`, adds the source to global config, and sets it as default
- **AND** prints a setup-complete summary pointing at `apeek search` as the next step

#### Scenario: Connection test fails during setup

- **WHEN** the user configures a source in the wizard and the connection test fails
- **THEN** the wizard reports the failure and asks whether to save the source anyway
- **AND** only writes the source if the user confirms

#### Scenario: Atomic failure

- **WHEN** writing one of the integration files fails mid-wizard (e.g. permission denied)
- **THEN** the system prints an error naming the failing path
- **AND** does NOT leave partial files on disk for that integration
- **AND** exits with code 2

### Requirement: Non-TTY `setup` refuses to prompt

The system SHALL detect when stdin is not a TTY during `setup` and refuse to prompt silently.

#### Scenario: `setup` with piped stdin

- **WHEN** the user runs `apeek setup < /dev/null` or in a non-interactive CI environment
- **THEN** the system prints an error directing the user to the non-interactive `install <agent>` and `source add` commands
- **AND** exits with code 1

### Requirement: Embedded templates

The system SHALL bundle agent skill/rule templates inside the published package so that setup and install perform no network requests to retrieve templates.

#### Scenario: Offline install

- **WHEN** the user runs `apeek install claude-code` on a machine with no network connectivity
- **THEN** the installation succeeds using the bundled template

#### Scenario: Template version tied to package

- **WHEN** `apeek` version X is installed and the user runs `apeek install cursor`
- **THEN** the written rule file matches the template bundled with version X exactly

### Requirement: Claude Code skill template content

The Claude Code skill template SHALL contain frontmatter with `name: apeek` and a `description` covering its triggers, plus a body documenting the `search` / `op` / `schema` workflow with examples and call limits.

#### Scenario: Template frontmatter shape

- **WHEN** the installed `SKILL.md` is inspected
- **THEN** the file starts with YAML frontmatter containing the keys `name` (value `apeek`) and `description`
- **AND** the `description` value names specific triggers including HTTP endpoints, request/response schemas, and "how do I call X"

#### Scenario: Body references commands

- **WHEN** the installed `SKILL.md` is inspected
- **THEN** the body includes fenced command examples for `apeek search`, `apeek op`, and `apeek schema`
- **AND** includes a "max 5 invocations per user question" guidance line
- **AND** includes an installation hint (`npx @spryx/apeek@latest setup`) for the case where `apeek` is not yet installed

### Requirement: Cursor rule template content

The Cursor rule template SHALL contain frontmatter with `alwaysApply: true` and a body documenting the `search` / `op` / `schema` workflow and the same command limits as the Claude Code skill.

#### Scenario: Rule frontmatter

- **WHEN** the installed `apeek.mdc` is inspected
- **THEN** the file starts with YAML frontmatter containing `alwaysApply: true`

#### Scenario: Rule body

- **WHEN** the installed `apeek.mdc` is inspected
- **THEN** the body includes the three core commands, the "max 5 invocations" guidance, the "use descriptive queries not single words" guidance, and the setup fallback instruction

### Requirement: Agent module extensibility

The system SHALL structure the agents directory so that adding a new agent in v0.2+ requires only adding one module implementing the `AgentIntegration` interface, registering it in the registry, and adding a template file — with no changes to `setup`, `install`, or detection infrastructure.

#### Scenario: Registry drives both commands

- **WHEN** a new agent module is added and registered
- **THEN** `apeek install <new-agent>` and the `apeek setup` agent list both recognize it automatically

