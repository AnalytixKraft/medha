import { describe, expect, it } from "vitest";
import { sanitizeEmailBody, sanitizeEmailHtmlToText } from "./sanitize.js";

describe("email sanitize", () => {
  it("strips scripts and images from HTML", () => {
    const html = `
      <html><body>
        <script>alert('x')</script>
        <p>Hello <strong>world</strong></p>
        <img src="https://tracker.example/pixel" />
      </body></html>
    `;
    const text = sanitizeEmailHtmlToText(html);
    expect(text).toContain("Hello world");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("tracker");
  });

  it("prefers plain text body when available", () => {
    const text = sanitizeEmailBody({
      text: "Plain text body",
      html: "<p>Ignored</p>",
    });
    expect(text).toBe("Plain text body");
  });
});
