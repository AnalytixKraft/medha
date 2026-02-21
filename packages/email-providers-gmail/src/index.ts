import { createHash } from "node:crypto";
import { sanitizeEmailBody, sanitizeHeadersSubset } from "../../email-core/src/index.js";
import type { EmailMessage, EmailMessageMeta, EmailSendPayload } from "../../email-core/src/index.js";

const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_DEFAULT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs?: number;
  tokenType?: string;
};

export type GmailUserProfile = {
  email: string;
  name?: string;
};

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseHeaders(
  items: Array<{ name?: string; value?: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items ?? []) {
    const key = (item.name ?? "").trim().toLowerCase();
    const value = (item.value ?? "").trim();
    if (!key || !value) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function extractBodyFromPayload(payload: unknown): { text?: string; html?: string } {
  const body = payload as {
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  };

  const mimeType = String(body?.mimeType ?? "").toLowerCase();
  const data = typeof body?.body?.data === "string" ? body.body.data : "";
  if ((mimeType === "text/plain" || mimeType === "text/html") && data) {
    const decoded = base64UrlDecode(data);
    return mimeType === "text/html" ? { html: decoded } : { text: decoded };
  }

  const parts = Array.isArray(body?.parts) ? body.parts : [];
  let text: string | undefined;
  let html: string | undefined;
  for (const part of parts) {
    const nested = extractBodyFromPayload(part);
    if (!text && nested.text) {
      text = nested.text;
    }
    if (!html && nested.html) {
      html = nested.html;
    }
    if (text && html) {
      break;
    }
  }

  return { text, html };
}

async function gmailFetch<T>(token: string, pathOrUrl: string, init?: RequestInit): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GMAIL_API_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.headers),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`gmail request failed (${response.status}): ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

export function buildGooglePkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: (input.scopes ?? GMAIL_DEFAULT_SCOPES).join(" "),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });
  return `${GMAIL_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCodeForTokens(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  });

  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`google oauth token exchange failed: ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  const accessToken = payload.access_token?.trim();
  if (!accessToken) {
    throw new Error("google oauth response missing access_token");
  }

  return {
    accessToken,
    refreshToken: payload.refresh_token?.trim() || undefined,
    tokenType: payload.token_type,
    expiresAtMs:
      typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
        ? Date.now() + payload.expires_in * 1000
        : undefined,
  };
}

export async function refreshGoogleAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<GoogleTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`google oauth refresh failed: ${detail || response.statusText}`);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  const accessToken = payload.access_token?.trim();
  if (!accessToken) {
    throw new Error("google oauth refresh response missing access_token");
  }
  return {
    accessToken,
    refreshToken: input.refreshToken,
    tokenType: payload.token_type,
    expiresAtMs:
      typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
        ? Date.now() + payload.expires_in * 1000
        : undefined,
  };
}

export async function fetchGoogleProfile(accessToken: string): Promise<GmailUserProfile> {
  const response = await fetch(GMAIL_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`google profile request failed: ${detail || response.statusText}`);
  }
  const payload = (await response.json()) as {
    email?: string;
    name?: string;
  };
  const email = payload.email?.trim();
  if (!email) {
    throw new Error("google profile response missing email");
  }
  return { email, name: payload.name?.trim() || undefined };
}

export async function gmailSearchMessages(input: {
  accessToken: string;
  query: string;
  limit: number;
}): Promise<EmailMessageMeta[]> {
  const maxResults = Math.max(1, Math.min(25, Math.floor(input.limit || 10)));
  const listParams = new URLSearchParams({
    maxResults: String(maxResults),
  });
  if (input.query.trim()) {
    listParams.set("q", input.query.trim());
  }

  const list = await gmailFetch<{
    messages?: Array<{ id?: string; threadId?: string }>;
  }>(input.accessToken, `/messages?${listParams.toString()}`);

  const messages = Array.isArray(list.messages) ? list.messages : [];
  const metas = await Promise.all(
    messages.map(async (entry) => {
      const id = entry.id?.trim();
      if (!id) {
        return null;
      }
      const meta = await gmailFetch<{
        id?: string;
        threadId?: string;
        snippet?: string;
        internalDate?: string;
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      }>(
        input.accessToken,
        `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      const headers = parseHeaders(meta.payload?.headers);
      const threadId = meta.threadId?.trim();
      const result: EmailMessageMeta = {
        id,
        from: headers.from ?? "Unknown",
        subject: headers.subject ?? "(No subject)",
        date:
          headers.date ??
          (typeof meta.internalDate === "string" && meta.internalDate
            ? new Date(Number.parseInt(meta.internalDate, 10)).toISOString()
            : new Date().toISOString()),
        snippet: (meta.snippet ?? "").trim(),
      };
      if (threadId) {
        result.threadId = threadId;
      }
      return result;
    }),
  );

  return metas.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function gmailGetMessage(input: {
  accessToken: string;
  messageId: string;
}): Promise<EmailMessage> {
  const result = await gmailFetch<{
    id?: string;
    threadId?: string;
    snippet?: string;
    internalDate?: string;
    payload?: {
      headers?: Array<{ name?: string; value?: string }>;
      body?: { data?: string };
      mimeType?: string;
      parts?: unknown[];
    };
  }>(input.accessToken, `/messages/${encodeURIComponent(input.messageId)}?format=full`);

  const headers = parseHeaders(result.payload?.headers);
  const bodySource = extractBodyFromPayload(result.payload);
  const bodyText = sanitizeEmailBody(bodySource, { maxTextChars: 25_000 });

  return {
    meta: {
      id: result.id?.trim() || input.messageId,
      threadId: result.threadId?.trim() || undefined,
      from: headers.from ?? "Unknown",
      subject: headers.subject ?? "(No subject)",
      date:
        headers.date ??
        (typeof result.internalDate === "string" && result.internalDate
          ? new Date(Number.parseInt(result.internalDate, 10)).toISOString()
          : new Date().toISOString()),
      snippet: (result.snippet ?? "").trim(),
    },
    bodyText,
    headersSubset: sanitizeHeadersSubset(headers, [
      "from",
      "to",
      "cc",
      "bcc",
      "subject",
      "date",
      "message-id",
    ]),
  };
}

function normalizeAddressList(values: string[] | undefined): string[] {
  return (values ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
}

export async function gmailSendMessage(input: {
  accessToken: string;
  from?: string;
  payload: EmailSendPayload;
}): Promise<{ messageId?: string }> {
  const to = normalizeAddressList(input.payload.to);
  if (to.length === 0) {
    throw new Error("at least one recipient is required");
  }

  const lines = [
    ...(input.from ? [`From: ${input.from}`] : []),
    `To: ${to.join(", ")}`,
    ...(normalizeAddressList(input.payload.cc).length > 0
      ? [`Cc: ${normalizeAddressList(input.payload.cc).join(", ")}`]
      : []),
    ...(normalizeAddressList(input.payload.bcc).length > 0
      ? [`Bcc: ${normalizeAddressList(input.payload.bcc).join(", ")}`]
      : []),
    `Subject: ${input.payload.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.payload.bodyText,
  ];

  const raw = base64UrlEncode(lines.join("\r\n"));
  const sent = await gmailFetch<{ id?: string }>(input.accessToken, "/messages/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  return { messageId: sent.id?.trim() || undefined };
}
