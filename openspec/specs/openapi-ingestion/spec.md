# openapi-ingestion Specification

## Purpose
TBD - created by archiving change bootstrap-apeek-cli. Update Purpose after archive.
## Requirements
### Requirement: Local file fetching

The system SHALL read OpenAPI specs from local files identified by filesystem path, supporting `.json`, `.yaml`, and `.yml` extensions.

#### Scenario: Loading JSON

- **WHEN** the source resolves to a local path ending in `.json` and the file contains valid JSON
- **THEN** the system reads the file and returns its parsed content to the parser

#### Scenario: Loading YAML

- **WHEN** the source resolves to a local path ending in `.yaml` or `.yml`
- **THEN** the system parses the file as YAML and returns the resulting object to the parser

#### Scenario: File not found

- **WHEN** the source resolves to a local path that does not exist
- **THEN** the system raises a `FetchError` naming the path
- **AND** exits with code 2

#### Scenario: Unsupported extension

- **WHEN** the source resolves to a local path with an extension other than `.json`, `.yaml`, or `.yml`
- **THEN** the system raises a `FetchError` listing supported extensions
- **AND** exits with code 1

### Requirement: HTTP and HTTPS fetching

The system SHALL fetch remote OpenAPI specs over HTTP(S) using the native `fetch` client, forwarding configured per-source headers.

#### Scenario: Successful HTTPS fetch with auth header

- **WHEN** a source has `https://api.example.com/openapi.json` and header `Authorization: Bearer <resolved-token>`
- **THEN** the system issues a `GET` request with the `Authorization` header set
- **AND** reads the body as JSON (or YAML per `Content-Type`)

#### Scenario: Non-2xx response

- **WHEN** the server returns HTTP 401
- **THEN** the system raises a `FetchError` naming the URL and status
- **AND** exits with code 3
- **AND** the error message does NOT include the request's `Authorization` header value

#### Scenario: Network failure

- **WHEN** the request fails because the host is unreachable or times out
- **THEN** the system raises a `FetchError` referencing the underlying failure
- **AND** exits with code 3

### Requirement: HTTPS enforcement for remote sources

The system SHALL reject `http://` source URLs by default, requiring an explicit opt-in.

#### Scenario: Plain HTTP rejected

- **WHEN** `source add` is called with an `http://` URL and `--allow-insecure` is not passed
- **THEN** the system prints an error requiring HTTPS
- **AND** exits with code 1

#### Scenario: Plain HTTP opt-in

- **WHEN** `source add` is called with an `http://` URL and `--allow-insecure` is passed
- **THEN** the system accepts the URL and persists an `allowInsecure: true` flag on that source

### Requirement: OpenAPI version validation

The system SHALL accept OpenAPI 3.0.x and 3.1.x specs and reject all other versions.

#### Scenario: OpenAPI 3.0 accepted

- **WHEN** a fetched spec declares `openapi: "3.0.3"`
- **THEN** the parser succeeds

#### Scenario: OpenAPI 3.1 accepted

- **WHEN** a fetched spec declares `openapi: "3.1.0"`
- **THEN** the parser succeeds

#### Scenario: Swagger 2.0 rejected

- **WHEN** a fetched spec declares `swagger: "2.0"`
- **THEN** the parser raises a `ParseError` naming the unsupported version
- **AND** exits with code 2

#### Scenario: Missing version field

- **WHEN** a fetched spec has neither `openapi` nor `swagger` fields
- **THEN** the parser raises a `ParseError` stating the spec is not recognizable as OpenAPI
- **AND** exits with code 2

### Requirement: `$ref` resolution

The system SHALL resolve all `$ref` pointers in a spec before the normalized spec is passed to the indexer or formatter.

#### Scenario: Internal refs resolved

- **WHEN** a spec's operation references `#/components/schemas/Deal` in its request body
- **THEN** the normalized spec returned by the parser has the inline `Deal` schema substituted at that location

#### Scenario: External refs resolved

- **WHEN** a spec references another document via a relative URL or filesystem path
- **THEN** the parser fetches and inlines the referenced document

#### Scenario: Broken ref

- **WHEN** a spec contains a `$ref` that cannot be resolved
- **THEN** the parser raises a `ParseError` naming the unresolvable pointer
- **AND** exits with code 2

### Requirement: Parse timeout

The system SHALL enforce a 30-second timeout on the parse phase to guard against pathological specs.

#### Scenario: Parse exceeds 30s

- **WHEN** parsing a spec takes longer than 30 seconds
- **THEN** the system aborts the parse and raises a `ParseError` with a hint that the spec may be very large or contain cyclic refs
- **AND** exits with code 2

### Requirement: Filesystem cache

The system SHALL persist parsed specs and search indices under a cache root, keyed by a hash of a canonical source identifier.

#### Scenario: Cache location follows XDG

- **WHEN** `XDG_CACHE_HOME` is set
- **THEN** cache entries are written under `$XDG_CACHE_HOME/apeek/<source-hash>/`

#### Scenario: Cache fallback path

- **WHEN** `XDG_CACHE_HOME` is unset
- **THEN** cache entries are written under `$HOME/.cache/apeek/<source-hash>/`

#### Scenario: Cache entry shape

- **WHEN** a spec is fetched and indexed successfully
- **THEN** the cache directory contains `spec.json`, `index.json`, and `meta.json`
- **AND** `meta.json` contains `fetchedAt`, `ttlSeconds`, optional `etag`, optional `lastModified`, `specHash`, a cache schema version, and the Node major version

### Requirement: Cache TTL

The system SHALL honor a per-source cache TTL, defaulting to 3600 seconds for remote sources and unlimited for local-file sources.

#### Scenario: Warm cache within TTL

- **WHEN** a cached entry's `fetchedAt + ttlSeconds` is in the future
- **THEN** the system serves the cached spec and index without issuing a network request

#### Scenario: Expired TTL triggers refetch

- **WHEN** a cached entry's TTL has elapsed
- **THEN** the system issues a conditional refetch (with `If-None-Match` or `If-Modified-Since` if available)
- **AND** either replaces the cache on a `200` response or reuses it on a `304`

#### Scenario: Local source never expires by TTL

- **WHEN** a cached entry corresponds to a local-file source and no explicit TTL was configured
- **THEN** the system uses the cache regardless of age
- **AND** `apeek source refresh` is the only way to rebuild it (in addition to cache clear or `--refresh`)

### Requirement: Cache invalidation signals

The system SHALL invalidate a cache entry when any of the following occurs: TTL expiry, ETag / Last-Modified mismatch, manual `source refresh`, `--refresh` flag, cache schema version bump, or Node major version change.

#### Scenario: ETag mismatch

- **WHEN** a cached entry records `etag: "abc"` and a conditional refetch returns `200` with `ETag: "xyz"`
- **THEN** the system replaces the cached `spec.json`, `index.json`, and `meta.json`

#### Scenario: `--refresh` flag

- **WHEN** the user runs any query command with `--refresh`
- **THEN** the system bypasses the cache entirely for that invocation, refetches, rebuilds, and rewrites the cache

#### Scenario: Cache schema version mismatch

- **WHEN** a cached entry's recorded cache schema version differs from the running `apeek` version's expected schema
- **THEN** the system discards the entry and performs a full refetch and reindex

### Requirement: Cache file permissions

The system SHALL create cache directories with mode `0700` and cache files with mode `0600` on POSIX platforms.

#### Scenario: Fresh cache entry on macOS or Linux

- **WHEN** the system writes a new cache entry on a POSIX platform
- **THEN** the cache directory's mode is `0700`
- **AND** each file inside is mode `0600`

#### Scenario: Cache on Windows

- **WHEN** the system writes a cache entry on Windows
- **THEN** the system proceeds without failing on mode-setting errors
- **AND** the behavior is documented as best-effort in the README

### Requirement: Atomic cache writes

The system SHALL write cache files via a temporary file followed by atomic rename, to prevent corruption on crash or interruption mid-write.

#### Scenario: Successful atomic write

- **WHEN** the system writes `spec.json` to cache
- **THEN** it first writes to `spec.json.tmp` in the same directory
- **AND** renames `spec.json.tmp` to `spec.json` only after the write completes

#### Scenario: Corrupt cache on read

- **WHEN** a cached `spec.json` or `index.json` fails to parse
- **THEN** the system discards that cache entry and treats the source as a cache miss
- **AND** the user-facing command proceeds to refetch instead of raising an error to the user

