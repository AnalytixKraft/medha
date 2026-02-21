import { parseHTML } from "linkedom";

const DEFAULT_MAX_TEXT = 25_000;
const DEFAULT_MAX_HEADER_VALUE = 1024;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeEmailHtmlToText(
  html: string,
  opts?: {
    maxTextChars?: number;
  },
): string {
  const input = typeof html === "string" ? html : "";
  if (!input.trim()) {
    return "";
  }

  const maxTextChars =
    typeof opts?.maxTextChars === "number" && Number.isFinite(opts.maxTextChars)
      ? Math.max(200, Math.floor(opts.maxTextChars))
      : DEFAULT_MAX_TEXT;

  const { document } = parseHTML(input);

  for (const selector of [
    "script",
    "style",
    "noscript",
    "iframe",
    "object",
    "embed",
    "svg",
    "canvas",
    "meta",
    "link",
  ]) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      node.remove();
    }
  }

  // Images and tracking pixels are dropped entirely in v1.
  for (const img of Array.from(document.querySelectorAll("img"))) {
    img.remove();
  }

  const rawText = document.body?.textContent ?? document.documentElement?.textContent ?? "";
  const normalized = collapseWhitespace(rawText);
  if (normalized.length <= maxTextChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxTextChars)}…`;
}

export function sanitizeEmailBody(
  body: { text?: string; html?: string },
  opts?: { maxTextChars?: number },
): string {
  const plain = typeof body.text === "string" ? body.text.trim() : "";
  if (plain) {
    const maxTextChars =
      typeof opts?.maxTextChars === "number" && Number.isFinite(opts.maxTextChars)
        ? Math.max(200, Math.floor(opts.maxTextChars))
        : DEFAULT_MAX_TEXT;
    return plain.length > maxTextChars ? `${plain.slice(0, maxTextChars)}…` : plain;
  }
  return sanitizeEmailHtmlToText(typeof body.html === "string" ? body.html : "", opts);
}

export function sanitizeHeadersSubset(
  headers: Record<string, string | undefined>,
  keys: string[],
  opts?: { maxValueChars?: number },
): Record<string, string> {
  const maxValueChars =
    typeof opts?.maxValueChars === "number" && Number.isFinite(opts.maxValueChars)
      ? Math.max(64, Math.floor(opts.maxValueChars))
      : DEFAULT_MAX_HEADER_VALUE;

  const out: Record<string, string> = {};
  for (const key of keys) {
    const raw = headers[key];
    if (typeof raw !== "string") {
      continue;
    }
    const normalized = collapseWhitespace(raw);
    if (!normalized) {
      continue;
    }
    out[key] = normalized.length > maxValueChars ? `${normalized.slice(0, maxValueChars)}…` : normalized;
  }
  return out;
}
