import type { GatewayBrowserClient } from "../gateway.ts";

export type EmailAccountSummary = {
  id: string;
  provider: "gmail" | "microsoft" | "imap-smtp";
  address: string;
  displayName?: string;
  status: "connected" | "error" | "expired";
  createdAt: string;
  updatedAt: string;
};

export type EmailMessageMeta = {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export type EmailMessage = {
  meta: EmailMessageMeta;
  bodyText: string;
  headersSubset: Record<string, string>;
};

export type EmailDraftPreview = {
  draftId: string;
  confirmationCode: string;
  preview: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    bodyText: string;
  };
  expiresAt: string;
};

export type EmailPendingDraft = {
  draftId: string;
  accountId: string;
  preview: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    bodyText: string;
  };
  expiresAt: string;
};

export type EmailState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  emailLoading: boolean;
  emailBusy: boolean;
  emailError: string | null;
  emailStatus: string | null;
  emailAccounts: EmailAccountSummary[];
  emailSelectedAccountId: string;
  emailQuery: string;
  emailMessages: EmailMessageMeta[];
  emailMessageLoading: boolean;
  emailSelectedMessage: EmailMessage | null;
  emailPendingDraft: EmailDraftPreview | null;
  emailConfirmCode: string;
  emailDrafts: EmailPendingDraft[];
  emailGoogleClientId: string;
  emailGoogleClientSecret: string;
  emailMicrosoftClientId: string;
  emailMicrosoftClientSecret: string;
};

function ensureClient(state: EmailState): GatewayBrowserClient {
  if (!state.client || !state.connected) {
    throw new Error("Gateway is offline.");
  }
  return state.client;
}

function resolveRedirectUri(path: "/oauth/google/callback" | "/oauth/microsoft/callback"): string {
  return `${window.location.origin}${path}`;
}

export async function loadEmailAccounts(state: EmailState) {
  if (state.emailLoading) {
    return;
  }
  if (!state.client || !state.connected) {
    return;
  }
  state.emailLoading = true;
  state.emailError = null;
  try {
    const client = ensureClient(state);
    const [accountsRes, draftsRes] = await Promise.all([
      client.request<{ accounts?: EmailAccountSummary[] }>("email.accounts.list", {}),
      client.request<{ drafts?: EmailPendingDraft[] }>("email.drafts.list", {}),
    ]);

    state.emailAccounts = Array.isArray(accountsRes.accounts) ? accountsRes.accounts : [];
    state.emailDrafts = Array.isArray(draftsRes.drafts) ? draftsRes.drafts : [];

    if (state.emailAccounts.length === 0) {
      state.emailSelectedAccountId = "";
      state.emailMessages = [];
      state.emailSelectedMessage = null;
    } else if (!state.emailSelectedAccountId) {
      state.emailSelectedAccountId = state.emailAccounts[0]?.id ?? "";
    }
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailLoading = false;
  }
}

export async function connectGoogleEmail(state: EmailState) {
  if (state.emailBusy) {
    return;
  }
  state.emailBusy = true;
  state.emailError = null;
  state.emailStatus = null;
  try {
    const client = ensureClient(state);
    const res = await client.request<{ authorizationUrl?: string }>("email.accounts.connect.google", {
      redirectUri: resolveRedirectUri("/oauth/google/callback"),
      clientId: state.emailGoogleClientId.trim() || undefined,
      clientSecret: state.emailGoogleClientSecret.trim() || undefined,
    });
    const url = res.authorizationUrl?.trim();
    if (!url) {
      throw new Error("Google authorization URL missing.");
    }
    window.open(url, "medha-google-oauth", "popup=yes,width=560,height=720");
    state.emailStatus = "Google sign-in opened. Complete consent and then refresh accounts.";
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailBusy = false;
  }
}

export async function connectMicrosoftEmail(state: EmailState) {
  if (state.emailBusy) {
    return;
  }
  state.emailBusy = true;
  state.emailError = null;
  state.emailStatus = null;
  try {
    const client = ensureClient(state);
    const res = await client.request<{ authorizationUrl?: string }>(
      "email.accounts.connect.microsoft",
      {
        redirectUri: resolveRedirectUri("/oauth/microsoft/callback"),
        clientId: state.emailMicrosoftClientId.trim() || undefined,
        clientSecret: state.emailMicrosoftClientSecret.trim() || undefined,
      },
    );
    const url = res.authorizationUrl?.trim();
    if (!url) {
      throw new Error("Microsoft authorization URL missing.");
    }
    window.open(url, "medha-microsoft-oauth", "popup=yes,width=560,height=720");
    state.emailStatus = "Microsoft sign-in opened. Complete consent and then refresh accounts.";
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailBusy = false;
  }
}

export async function connectImapSmtpEmail(
  state: EmailState,
  payload: {
    address: string;
    displayName?: string;
    preset?: string;
    allowPasswordAuth?: boolean;
    protonBridgeHintAccepted?: boolean;
    testRead?: boolean;
    testSend?: boolean;
    imap: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password?: string;
      oauth2Token?: string;
    };
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password?: string;
      oauth2Token?: string;
      rejectUnauthorized?: boolean;
    };
  },
) {
  if (state.emailBusy) {
    return;
  }
  state.emailBusy = true;
  state.emailError = null;
  state.emailStatus = null;
  try {
    const client = ensureClient(state);
    await client.request("email.accounts.connect.imapSmtp", payload);
    state.emailStatus = "IMAP/SMTP account connected.";
    await loadEmailAccounts(state);
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailBusy = false;
  }
}

export async function removeEmailAccount(state: EmailState, accountId: string) {
  if (state.emailBusy) {
    return;
  }
  state.emailBusy = true;
  state.emailError = null;
  state.emailStatus = null;
  try {
    const client = ensureClient(state);
    await client.request("email.accounts.remove", { accountId });
    state.emailStatus = "Email account removed.";
    if (state.emailSelectedAccountId === accountId) {
      state.emailSelectedAccountId = "";
      state.emailMessages = [];
      state.emailSelectedMessage = null;
    }
    await loadEmailAccounts(state);
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailBusy = false;
  }
}

export async function searchEmailMessages(state: EmailState) {
  if (state.emailMessageLoading) {
    return;
  }
  if (!state.emailSelectedAccountId) {
    state.emailError = "Select an email account first.";
    return;
  }
  state.emailMessageLoading = true;
  state.emailError = null;
  state.emailSelectedMessage = null;
  try {
    const client = ensureClient(state);
    const result = await client.request<{ messages?: EmailMessageMeta[] }>("email.messages.search", {
      accountId: state.emailSelectedAccountId,
      query: state.emailQuery.trim(),
      limit: 10,
    });
    state.emailMessages = Array.isArray(result.messages) ? result.messages : [];
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailMessageLoading = false;
  }
}

export async function openEmailMessage(state: EmailState, messageId: string) {
  if (!state.emailSelectedAccountId) {
    state.emailError = "Select an email account first.";
    return;
  }
  state.emailMessageLoading = true;
  state.emailError = null;
  try {
    const client = ensureClient(state);
    const result = await client.request<{ message?: EmailMessage }>("email.messages.get", {
      accountId: state.emailSelectedAccountId,
      messageId,
    });
    state.emailSelectedMessage = result.message ?? null;
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailMessageLoading = false;
  }
}

export async function draftEmailSend(state: EmailState, payload: {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
}) {
  if (state.emailBusy) {
    return;
  }
  if (!state.emailSelectedAccountId) {
    state.emailError = "Select an email account first.";
    return;
  }

  state.emailBusy = true;
  state.emailError = null;
  state.emailStatus = null;
  try {
    const client = ensureClient(state);
    const split = (value: string): string[] =>
      value
        .split(/[\n,;]+/g)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

    const draft = await client.request<EmailDraftPreview>("email.send.draft", {
      accountId: state.emailSelectedAccountId,
      to: split(payload.to),
      cc: split(payload.cc),
      bcc: split(payload.bcc),
      subject: payload.subject,
      bodyText: payload.bodyText,
    });
    state.emailPendingDraft = draft;
    state.emailConfirmCode = draft.confirmationCode;
    state.emailStatus = "Draft created. Review and confirm send.";
    await loadEmailAccounts(state);
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailBusy = false;
  }
}

export async function confirmEmailDraft(state: EmailState, draftId: string, confirmationCode: string) {
  if (state.emailBusy) {
    return;
  }
  state.emailBusy = true;
  state.emailError = null;
  state.emailStatus = null;
  try {
    const client = ensureClient(state);
    await client.request("email.send.confirm", {
      draftId,
      confirmationCode,
    });
    state.emailStatus = "Email sent.";
    state.emailPendingDraft = null;
    state.emailConfirmCode = "";
    await loadEmailAccounts(state);
  } catch (error) {
    state.emailError = String(error);
  } finally {
    state.emailBusy = false;
  }
}
