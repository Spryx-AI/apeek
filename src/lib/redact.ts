const REDACTED = "<redacted>";

const SENSITIVE_HEADER_PATTERNS: readonly RegExp[] = [
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /(^|-)api-key$/i,
  /(^|-)token$/i,
  /(^|-)secret$/i,
];

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER_PATTERNS.some((re) => re.test(name));
}

export function redactHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = isSensitiveHeader(name) ? REDACTED : value;
  }
  return out;
}
