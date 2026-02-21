const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~-]+/gi, replacement: "Bearer [REDACTED]" },
  { pattern: /("access_token"\s*:\s*")[^"]+(")/gi, replacement: '$1[REDACTED]$2' },
  { pattern: /("refresh_token"\s*:\s*")[^"]+(")/gi, replacement: '$1[REDACTED]$2' },
  { pattern: /("client_secret"\s*:\s*")[^"]+(")/gi, replacement: '$1[REDACTED]$2' },
  { pattern: /("password"\s*:\s*")[^"]+(")/gi, replacement: '$1[REDACTED]$2' },
  { pattern: /([?&](?:access_token|refresh_token|client_secret|password)=)[^&\s]+/gi, replacement: "$1[REDACTED]" },
];

export function redactEmailSecrets(value: string): string {
  let output = value;
  for (const rule of REDACTION_PATTERNS) {
    output = output.replace(rule.pattern, rule.replacement);
  }
  return output;
}
