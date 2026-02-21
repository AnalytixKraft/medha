import { createHash } from "node:crypto";
import { sanitizeEmailBody, sanitizeHeadersSubset } from "../../email-core/src/index.js";
import type { EmailMessage, EmailMessageMeta, EmailSendPayload } from "../../email-core/src/index.js";

const GRAPH_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const GRAPH_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

export const GRAPH_DEFAULT_SCOPES = ["offline_access", "User.Read", "Mail.Read", "Mail.Send"];

export type GraphTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs?: number;
  tokenType?: string;
};

export type GraphUserProfile = {
  email: string;
  name?: string;
};

function normalizeDate(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function normalizeAddressList(values: string[] | undefined): string[] {
  return (values ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
}

function graphHeadersFromInternetHeaders(
  list: Array<{ name?: string; value?: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of list ?? []) {
    const key = (row.name ?? "").trim().toLowerCase();
    const value = (row.value ?? "").trim();
    if (!key || !value) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

async function graphFetch<T>(
  token: string,
  pathOrUrl: string,
  init?: RequestInit,
  options?: { consistencyLevel?: "eventual" },
): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH_API_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options?.consistencyLevel ? { ConsistencyLevel: options.consistencyLevel } : {}),
      ...(init?.headers),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`graph request failed (${response.status}): ${detail || response.statusText}`);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json()) as T;
}

export function buildMicrosoftPkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function buildMicrosoftAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
}) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    response_mode: "query",
    scope: (input.scopes ?? GRAPH_DEFAULT_SCOPES).join(" "),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GRAPH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeMicrosoftCodeForTokens(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<GraphTokenSet> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });

  const response = await fetch(GRAPH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`microsoft oauth token exchange failed: ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  const accessToken = payload.access_token?.trim();
  if (!accessToken) {
    throw new Error("microsoft oauth response missing access_token");
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

export async function refreshMicrosoftAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<GraphTokenSet> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    scope: GRAPH_DEFAULT_SCOPES.join(" "),
  });

  const response = await fetch(GRAPH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`microsoft oauth refresh failed: ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  const accessToken = payload.access_token?.trim();
  if (!accessToken) {
    throw new Error("microsoft oauth refresh response missing access_token");
  }

  return {
    accessToken,
    refreshToken: payload.refresh_token?.trim() || input.refreshToken,
    tokenType: payload.token_type,
    expiresAtMs:
      typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
        ? Date.now() + payload.expires_in * 1000
        : undefined,
  };
}

export async function fetchMicrosoftProfile(accessToken: string): Promise<GraphUserProfile> {
  const me = await graphFetch<{
    userPrincipalName?: string;
    mail?: string;
    displayName?: string;
  }>(accessToken, "/me");

  const email = me.mail?.trim() || me.userPrincipalName?.trim() || "";
  if (!email) {
    throw new Error("microsoft profile response missing email");
  }
  return {
    email,
    name: me.displayName?.trim() || undefined,
  };
}

export async function graphSearchMessages(input: {
  accessToken: string;
  query: string;
  limit: number;
}): Promise<EmailMessageMeta[]> {
  const top = Math.max(1, Math.min(25, Math.floor(input.limit || 10)));
  const params = new URLSearchParams({
    $top: String(top),
    $orderby: "receivedDateTime DESC",
    $select: "id,conversationId,subject,from,receivedDateTime,bodyPreview",
  });

  if (input.query.trim()) {
    params.set("$search", `"${input.query.trim().replace(/"/g, "\\\"")}"`);
  }

  const result = await graphFetch<{
    value?: Array<{
      id?: string;
      conversationId?: string;
      subject?: string;
      from?: { emailAddress?: { name?: string; address?: string } };
      receivedDateTime?: string;
      bodyPreview?: string;
    }>;
  }>(input.accessToken, `/me/messages?${params.toString()}`, undefined, {
    consistencyLevel: input.query.trim() ? "eventual" : undefined,
  });

  return (result.value ?? []).flatMap((row) => {
    const id = row.id?.trim();
    if (!id) {
      return [];
    }
    const fromName = row.from?.emailAddress?.name?.trim();
    const fromAddress = row.from?.emailAddress?.address?.trim();
    return [
      {
        id,
        threadId: row.conversationId?.trim() || undefined,
        from: fromName && fromAddress ? `${fromName} <${fromAddress}>` : (fromAddress ?? "Unknown"),
        subject: row.subject?.trim() || "(No subject)",
        date: normalizeDate(row.receivedDateTime),
        snippet: row.bodyPreview?.trim() || "",
      } satisfies EmailMessageMeta,
    ];
  });
}

export async function graphGetMessage(input: {
  accessToken: string;
  messageId: string;
}): Promise<EmailMessage> {
  const params = new URLSearchParams({
    $select:
      "id,conversationId,subject,from,receivedDateTime,body,bodyPreview,internetMessageHeaders",
  });

  const message = await graphFetch<{
    id?: string;
    conversationId?: string;
    subject?: string;
    from?: { emailAddress?: { name?: string; address?: string } };
    receivedDateTime?: string;
    body?: { contentType?: string; content?: string };
    bodyPreview?: string;
    internetMessageHeaders?: Array<{ name?: string; value?: string }>;
  }>(input.accessToken, `/me/messages/${encodeURIComponent(input.messageId)}?${params.toString()}`);

  const fromName = message.from?.emailAddress?.name?.trim();
  const fromAddress = message.from?.emailAddress?.address?.trim();
  const from = fromName && fromAddress ? `${fromName} <${fromAddress}>` : (fromAddress ?? "Unknown");
  const rawHeaders = graphHeadersFromInternetHeaders(message.internetMessageHeaders);

  const bodyContent = message.body?.content ?? "";
  const bodyType = (message.body?.contentType ?? "text").toLowerCase();
  const bodyText =
    bodyType === "html"
      ? sanitizeEmailBody({ html: bodyContent }, { maxTextChars: 25_000 })
      : sanitizeEmailBody({ text: bodyContent }, { maxTextChars: 25_000 });

  return {
    meta: {
      id: message.id?.trim() || input.messageId,
      threadId: message.conversationId?.trim() || undefined,
      from,
      subject: message.subject?.trim() || "(No subject)",
      date: normalizeDate(message.receivedDateTime),
      snippet: message.bodyPreview?.trim() || "",
    },
    bodyText,
    headersSubset: sanitizeHeadersSubset(rawHeaders, [
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

export async function graphSendMessage(input: {
  accessToken: string;
  payload: EmailSendPayload;
}): Promise<{ messageId?: string }> {
  const to = normalizeAddressList(input.payload.to);
  if (to.length === 0) {
    throw new Error("at least one recipient is required");
  }

  const toRecipients = to.map((address) => ({ emailAddress: { address } }));
  const ccRecipients = normalizeAddressList(input.payload.cc).map((address) => ({
    emailAddress: { address },
  }));
  const bccRecipients = normalizeAddressList(input.payload.bcc).map((address) => ({
    emailAddress: { address },
  }));

  await graphFetch(
    input.accessToken,
    "/me/sendMail",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: input.payload.subject,
          body: {
            contentType: "Text",
            content: input.payload.bodyText,
          },
          toRecipients,
          ...(ccRecipients.length ? { ccRecipients } : {}),
          ...(bccRecipients.length ? { bccRecipients } : {}),
        },
        saveToSentItems: true,
      }),
    },
  );

  return {};
}
