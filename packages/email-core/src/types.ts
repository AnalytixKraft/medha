export type EmailProviderId = "gmail" | "microsoft" | "imap-smtp";

export type EmailAccountStatus = "connected" | "error" | "expired";

export type EmailAccount = {
  id: string;
  provider: EmailProviderId;
  address: string;
  displayName?: string;
  status: EmailAccountStatus;
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

export type EmailSendPayload = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
};

export type EmailDraftPreview = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
};

export type EmailDraft = {
  draftId: string;
  preview: EmailDraftPreview;
  expiresAt: string;
};

export type EmailSendResult = {
  sent: boolean;
  messageId?: string;
  providerResponse?: string;
};

export type EmailConnectStartResult = {
  type: "oauth" | "manual";
  accountId?: string;
  authorizationUrl?: string;
  state?: string;
  codeVerifier?: string;
};

export type EmailProvider = {
  connect(input: Record<string, unknown>): Promise<EmailConnectStartResult>;
  search(input: { account: EmailAccount; query: string; limit: number }): Promise<EmailMessageMeta[]>;
  get(input: { account: EmailAccount; messageId: string }): Promise<EmailMessage>;
  draftSend(input: { account: EmailAccount; payload: EmailSendPayload }): Promise<EmailDraft>;
  confirmSend(input: { account: EmailAccount; draft: EmailDraft }): Promise<EmailSendResult>;
};
