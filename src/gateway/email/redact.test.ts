import { describe, expect, it } from "vitest";
import { redactEmailSecrets } from "./redact.js";

describe("redactEmailSecrets", () => {
  it("redacts bearer tokens and oauth payload secrets", () => {
    const value =
      'Bearer abc.def.123 {"access_token":"tok-123","refresh_token":"ref-456","client_secret":"sec-789","password":"pw-000"}';
    const redacted = redactEmailSecrets(value);
    expect(redacted).toContain("Bearer [REDACTED]");
    expect(redacted).toContain('"access_token":"[REDACTED]"');
    expect(redacted).toContain('"refresh_token":"[REDACTED]"');
    expect(redacted).toContain('"client_secret":"[REDACTED]"');
    expect(redacted).toContain('"password":"[REDACTED]"');
    expect(redacted).not.toContain("tok-123");
    expect(redacted).not.toContain("ref-456");
    expect(redacted).not.toContain("sec-789");
    expect(redacted).not.toContain("pw-000");
  });

  it("redacts token query params", () => {
    const value =
      "https://example.com/callback?access_token=aaa&refresh_token=bbb&client_secret=ccc&password=ddd";
    const redacted = redactEmailSecrets(value);
    expect(redacted).toContain("access_token=[REDACTED]");
    expect(redacted).toContain("refresh_token=[REDACTED]");
    expect(redacted).toContain("client_secret=[REDACTED]");
    expect(redacted).toContain("password=[REDACTED]");
  });
});
