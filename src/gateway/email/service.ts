import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  EmailAccount,
  EmailMessage,
  EmailMessageMeta,
  EmailSendPayload,
} from "../../../packages/email-core/src/index.js";
import { EncryptedJsonStore } from "../../../packages/email-core/src/index.js";
import {
  buildGoogleAuthorizationUrl,
  buildGooglePkceChallenge,
  exchangeGoogleCodeForTokens,
  fetchGoogleProfile,
  gmailGetMessage,
  gmailSearchMessages,
  gmailSendMessage,
  refreshGoogleAccessToken,
  type GoogleTokenSet,
} from "../../../packages/email-providers-gmail/src/index.js";
import {
  buildMicrosoftAuthorizationUrl,
  buildMicrosoftPkceChallenge,
  exchangeMicrosoftCodeForTokens,
  fetchMicrosoftProfile,
  graphGetMessage,
  graphSearchMessages,
  graphSendMessage,
  refreshMicrosoftAccessToken,
  type GraphTokenSet,
} from "../../../packages/email-providers-graph/src/index.js";
import {
  IMAP_SMTP_PRESETS,
  imapGetMessage,
  imapSearchMessages,
  smtpSendMessage,
  testImapConnection,
  testSmtpConnection,
  type ImapSmtpAccountConfig,
} from "../../../packages/email-providers-imap-smtp/src/index.js";
import { resolveEmailStorePassphrase } from "./passphrase.js";
import { redactEmailSecrets } from "./redact.js";

const METADATA_VERSION = 1;
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const DRAFT_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60_000;

type OAuthProvider = "gmail" | "microsoft";

type EmailAccountMetadata = EmailAccount & {
  providerLabel?: string;
};

type EmailMetadataStore = {
  version: number;
  accounts: Record<string, EmailAccountMetadata>;
};

type OAuthStateRecord = {
  provider: OAuthProvider;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  createdAtMs: number;
};

type OAuthSecretRecord = {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  expiresAtMs?: number;
};

type ImapSmtpSecretRecord = {
  provider: "imap-smtp";
  config: ImapSmtpAccountConfig;
};

type AccountSecretRecord = OAuthSecretRecord | ImapSmtpSecretRecord;

type DraftRecord = {
  draftId: string;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  confirmationCode: string;
  createdAtMs: number;
  expiresAtMs: number;
};

type EmailSecretsStore = {
  version: number;
  oauthStates: Record<string, OAuthStateRecord>;
  accounts: Record<string, AccountSecretRecord>;
  drafts: Record<string, DraftRecord>;
};

type OAuthConnectStartResult = {
  authorizationUrl: string;
  state: string;
};

type ImapSmtpConnectInput = {
  address: string;
  displayName?: string;
  preset?: keyof typeof IMAP_SMTP_PRESETS | "custom";
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
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmailAddress(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(trimmed)) {
    throw new Error(`invalid email address in ${label}: ${trimmed}`);
  }
  return trimmed;
}

function normalizeEmailList(values: string[] | undefined, label: string): string[] {
  const unique = new Set<string>();
  for (const raw of values ?? []) {
    const normalized = normalizeEmailAddress(raw, label);
    unique.add(normalized);
  }
  return Array.from(unique);
}

function parseGoogleOAuthClient(input?: { clientId?: string; clientSecret?: string }) {
  const clientId =
    input?.clientId?.trim() || process.env.MEDHA_EMAIL_GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret =
    input?.clientSecret?.trim() || process.env.MEDHA_EMAIL_GOOGLE_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth client missing. Set MEDHA_EMAIL_GOOGLE_CLIENT_ID and MEDHA_EMAIL_GOOGLE_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

function parseMicrosoftOAuthClient(input?: { clientId?: string; clientSecret?: string }) {
  const clientId =
    input?.clientId?.trim() || process.env.MEDHA_EMAIL_MICROSOFT_CLIENT_ID?.trim() || "";
  const clientSecret =
    input?.clientSecret?.trim() || process.env.MEDHA_EMAIL_MICROSOFT_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Microsoft OAuth client missing. Set MEDHA_EMAIL_MICROSOFT_CLIENT_ID and MEDHA_EMAIL_MICROSOFT_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

function makeStateToken(): string {
  return randomBytes(24).toString("base64url");
}

function makeCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function makeConfirmationCode(): string {
  const num = Math.floor(Math.random() * 1_000_000);
  return String(num).padStart(6, "0");
}

function sanitizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactEmailSecrets(raw);
}

function rethrowSanitized(error: unknown): never {
  const message = sanitizeError(error);
  if (error instanceof Error) {
    throw new Error(message, { cause: error });
  }
  throw new Error(message);
}

function isImapSmtpSecret(secret: AccountSecretRecord): secret is ImapSmtpSecretRecord {
  return secret.provider === "imap-smtp";
}

function normalizeTokenSet(base: OAuthSecretRecord, refreshed: GoogleTokenSet | GraphTokenSet): OAuthSecretRecord {
  return {
    ...base,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? base.refreshToken,
    expiresAtMs: refreshed.expiresAtMs,
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

export class GatewayEmailService {
  private metadataPath: string;
  private secretsStore: EncryptedJsonStore<EmailSecretsStore>;

  private constructor(
    private stateDir: string,
    passphrase: string,
  ) {
    this.metadataPath = path.join(this.stateDir, "email", "accounts.json");
    this.secretsStore = new EncryptedJsonStore<EmailSecretsStore>(
      path.join(this.stateDir, "email", "secrets.enc.json"),
      passphrase,
    );
  }

  static async create(input: { stateDir: string }): Promise<GatewayEmailService> {
    const passphrase = await resolveEmailStorePassphrase();
    const service = new GatewayEmailService(input.stateDir, passphrase);
    await service.ensureDirs();
    await service.cleanupExpiredRecords();
    return service;
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(path.join(this.stateDir, "email"), { recursive: true });
  }

  private async loadMetadata(): Promise<EmailMetadataStore> {
    const fallback: EmailMetadataStore = {
      version: METADATA_VERSION,
      accounts: {},
    };
    const loaded = await readJsonFile<EmailMetadataStore>(this.metadataPath, fallback);
    if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
      return fallback;
    }
    return {
      version: METADATA_VERSION,
      accounts: loaded.accounts ?? {},
    };
  }

  private async saveMetadata(metadata: EmailMetadataStore): Promise<void> {
    await mkdir(path.dirname(this.metadataPath), { recursive: true });
    await writeFile(this.metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  }

  private async loadSecrets(): Promise<EmailSecretsStore> {
    return await this.secretsStore.load({
      version: METADATA_VERSION,
      oauthStates: {},
      accounts: {},
      drafts: {},
    });
  }

  private async saveSecrets(secrets: EmailSecretsStore): Promise<void> {
    await this.secretsStore.save(secrets);
  }

  private async cleanupExpiredRecords(): Promise<void> {
    const secrets = await this.loadSecrets();
    const now = Date.now();

    let changed = false;
    for (const [state, entry] of Object.entries(secrets.oauthStates)) {
      if (entry.createdAtMs + OAUTH_STATE_TTL_MS < now) {
        delete secrets.oauthStates[state];
        changed = true;
      }
    }

    for (const [draftId, entry] of Object.entries(secrets.drafts)) {
      if (entry.expiresAtMs < now) {
        delete secrets.drafts[draftId];
        changed = true;
      }
    }

    if (changed) {
      await this.saveSecrets(secrets);
    }
  }

  async listAccounts(): Promise<EmailAccount[]> {
    const metadata = await this.loadMetadata();
    return Object.values(metadata.accounts).toSorted((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async listPendingDrafts(): Promise<
    Array<{
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
    }>
  > {
    const secrets = await this.loadSecrets();
    const now = Date.now();
    return Object.values(secrets.drafts)
      .filter((draft) => draft.expiresAtMs > now)
      .map((draft) => ({
        draftId: draft.draftId,
        accountId: draft.accountId,
        preview: {
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
          bodyText: draft.bodyText,
        },
        expiresAt: new Date(draft.expiresAtMs).toISOString(),
      }))
      .toSorted((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  }

  async removeAccount(accountId: string): Promise<{ removed: boolean }> {
    const metadata = await this.loadMetadata();
    const secrets = await this.loadSecrets();
    const existed = Boolean(metadata.accounts[accountId] || secrets.accounts[accountId]);
    if (!existed) {
      return { removed: false };
    }
    delete metadata.accounts[accountId];
    delete secrets.accounts[accountId];
    for (const [draftId, draft] of Object.entries(secrets.drafts)) {
      if (draft.accountId === accountId) {
        delete secrets.drafts[draftId];
      }
    }
    await Promise.all([this.saveMetadata(metadata), this.saveSecrets(secrets)]);
    return { removed: true };
  }

  async startGoogleOAuth(input: {
    redirectUri: string;
    clientId?: string;
    clientSecret?: string;
  }): Promise<OAuthConnectStartResult> {
    const oauthClient = parseGoogleOAuthClient({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    });
    const redirectUri = input.redirectUri.trim();
    if (!redirectUri) {
      throw new Error("redirectUri is required");
    }

    const state = makeStateToken();
    const codeVerifier = makeCodeVerifier();
    const codeChallenge = buildGooglePkceChallenge(codeVerifier);

    const secrets = await this.loadSecrets();
    secrets.oauthStates[state] = {
      provider: "gmail",
      codeVerifier,
      redirectUri,
      clientId: oauthClient.clientId,
      clientSecret: oauthClient.clientSecret,
      createdAtMs: Date.now(),
    };
    await this.saveSecrets(secrets);

    return {
      state,
      authorizationUrl: buildGoogleAuthorizationUrl({
        clientId: oauthClient.clientId,
        redirectUri,
        state,
        codeChallenge,
      }),
    };
  }

  async startMicrosoftOAuth(input: {
    redirectUri: string;
    clientId?: string;
    clientSecret?: string;
  }): Promise<OAuthConnectStartResult> {
    const oauthClient = parseMicrosoftOAuthClient({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    });
    const redirectUri = input.redirectUri.trim();
    if (!redirectUri) {
      throw new Error("redirectUri is required");
    }

    const state = makeStateToken();
    const codeVerifier = makeCodeVerifier();
    const codeChallenge = buildMicrosoftPkceChallenge(codeVerifier);

    const secrets = await this.loadSecrets();
    secrets.oauthStates[state] = {
      provider: "microsoft",
      codeVerifier,
      redirectUri,
      clientId: oauthClient.clientId,
      clientSecret: oauthClient.clientSecret,
      createdAtMs: Date.now(),
    };
    await this.saveSecrets(secrets);

    return {
      state,
      authorizationUrl: buildMicrosoftAuthorizationUrl({
        clientId: oauthClient.clientId,
        redirectUri,
        state,
        codeChallenge,
      }),
    };
  }

  private async upsertOAuthAccount(input: {
    provider: OAuthProvider;
    email: string;
    name?: string;
    tokenSet: GoogleTokenSet | GraphTokenSet;
    clientId: string;
    clientSecret: string;
  }): Promise<EmailAccount> {
    const metadata = await this.loadMetadata();
    const secrets = await this.loadSecrets();

    const existing = Object.values(metadata.accounts).find(
      (account) => account.provider === input.provider && account.address.toLowerCase() === input.email.toLowerCase(),
    );

    const now = nowIso();
    const accountId = existing?.id ?? randomUUID();
    const account: EmailAccountMetadata = {
      id: accountId,
      provider: input.provider,
      address: input.email,
      displayName: input.name,
      status: "connected",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      providerLabel: input.provider === "gmail" ? "Google" : "Microsoft",
    };

    metadata.accounts[accountId] = account;
    secrets.accounts[accountId] = {
      provider: input.provider,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      accessToken: input.tokenSet.accessToken,
      refreshToken: input.tokenSet.refreshToken,
      expiresAtMs: input.tokenSet.expiresAtMs,
    };

    await Promise.all([this.saveMetadata(metadata), this.saveSecrets(secrets)]);
    return account;
  }

  async completeOAuthCallback(input: {
    provider: OAuthProvider;
    code: string;
    state: string;
  }): Promise<EmailAccount> {
    const secrets = await this.loadSecrets();
    const stateEntry = secrets.oauthStates[input.state];
    if (!stateEntry) {
      throw new Error("oauth state not found or expired");
    }
    if (stateEntry.provider !== input.provider) {
      throw new Error("oauth state provider mismatch");
    }
    if (stateEntry.createdAtMs + OAUTH_STATE_TTL_MS < Date.now()) {
      delete secrets.oauthStates[input.state];
      await this.saveSecrets(secrets);
      throw new Error("oauth state expired");
    }

    delete secrets.oauthStates[input.state];
    await this.saveSecrets(secrets);

    if (input.provider === "gmail") {
      const tokenSet = await exchangeGoogleCodeForTokens({
        clientId: stateEntry.clientId,
        clientSecret: stateEntry.clientSecret,
        redirectUri: stateEntry.redirectUri,
        code: input.code,
        codeVerifier: stateEntry.codeVerifier,
      });
      const profile = await fetchGoogleProfile(tokenSet.accessToken);
      return await this.upsertOAuthAccount({
        provider: "gmail",
        email: profile.email,
        name: profile.name,
        tokenSet,
        clientId: stateEntry.clientId,
        clientSecret: stateEntry.clientSecret,
      });
    }

    const tokenSet = await exchangeMicrosoftCodeForTokens({
      clientId: stateEntry.clientId,
      clientSecret: stateEntry.clientSecret,
      redirectUri: stateEntry.redirectUri,
      code: input.code,
      codeVerifier: stateEntry.codeVerifier,
    });
    const profile = await fetchMicrosoftProfile(tokenSet.accessToken);
    return await this.upsertOAuthAccount({
      provider: "microsoft",
      email: profile.email,
      name: profile.name,
      tokenSet,
      clientId: stateEntry.clientId,
      clientSecret: stateEntry.clientSecret,
    });
  }

  async connectImapSmtp(input: ImapSmtpConnectInput): Promise<EmailAccount> {
    const address = normalizeEmailAddress(input.address, "address");
    const allowPasswordAuth = input.allowPasswordAuth === true;

    if (!allowPasswordAuth) {
      const imapHasPassword = Boolean(input.imap.password?.trim());
      const smtpHasPassword = Boolean(input.smtp.password?.trim());
      if (imapHasPassword || smtpHasPassword) {
        throw new Error(
          "password auth requires explicit opt-in. Set allowPasswordAuth=true to store app-password/password.",
        );
      }
    }

    const config: ImapSmtpAccountConfig = {
      preset: (input.preset ?? "custom") as ImapSmtpAccountConfig["preset"],
      address,
      displayName: input.displayName?.trim() || undefined,
      allowPasswordAuth,
      protonBridgeHintAccepted: input.protonBridgeHintAccepted,
      imap: {
        host: input.imap.host.trim(),
        port: input.imap.port,
        secure: input.imap.secure,
        username: input.imap.username.trim(),
        password: input.imap.password?.trim() || undefined,
        oauth2Token: input.imap.oauth2Token?.trim() || undefined,
      },
      smtp: {
        host: input.smtp.host.trim(),
        port: input.smtp.port,
        secure: input.smtp.secure,
        username: input.smtp.username.trim(),
        password: input.smtp.password?.trim() || undefined,
        oauth2Token: input.smtp.oauth2Token?.trim() || undefined,
        rejectUnauthorized: input.smtp.rejectUnauthorized,
      },
    };

    if (input.testRead) {
      await testImapConnection(config.imap);
    }
    if (input.testSend) {
      await testSmtpConnection(config.smtp);
    }

    const metadata = await this.loadMetadata();
    const secrets = await this.loadSecrets();
    const existing = Object.values(metadata.accounts).find(
      (account) =>
        account.provider === "imap-smtp" && account.address.toLowerCase() === address.toLowerCase(),
    );
    const accountId = existing?.id ?? randomUUID();
    const now = nowIso();

    const account: EmailAccountMetadata = {
      id: accountId,
      provider: "imap-smtp",
      address,
      displayName: config.displayName,
      status: "connected",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      providerLabel:
        config.preset !== "custom" ? IMAP_SMTP_PRESETS[config.preset as keyof typeof IMAP_SMTP_PRESETS]?.label : "Custom",
    };

    metadata.accounts[accountId] = account;
    secrets.accounts[accountId] = {
      provider: "imap-smtp",
      config,
    };

    await Promise.all([this.saveMetadata(metadata), this.saveSecrets(secrets)]);
    return account;
  }

  private async resolveAccount(inputAccountId: string): Promise<{
    account: EmailAccountMetadata;
    secret: AccountSecretRecord;
    metadata: EmailMetadataStore;
    secrets: EmailSecretsStore;
  }> {
    await this.cleanupExpiredRecords();
    const metadata = await this.loadMetadata();
    const secrets = await this.loadSecrets();
    const account = metadata.accounts[inputAccountId];
    const secret = secrets.accounts[inputAccountId];
    if (!account || !secret) {
      throw new Error(`email account not found: ${inputAccountId}`);
    }
    return { account, secret, metadata, secrets };
  }

  private async setAccountStatus(
    metadata: EmailMetadataStore,
    accountId: string,
    status: EmailAccount["status"],
  ): Promise<void> {
    const account = metadata.accounts[accountId];
    if (!account) {
      return;
    }
    account.status = status;
    account.updatedAt = nowIso();
    metadata.accounts[accountId] = account;
    await this.saveMetadata(metadata);
  }

  private async getRefreshedOAuthSecret(
    accountId: string,
    secret: OAuthSecretRecord,
    secrets: EmailSecretsStore,
  ): Promise<OAuthSecretRecord> {
    const expiresSoon =
      typeof secret.expiresAtMs === "number" &&
      Number.isFinite(secret.expiresAtMs) &&
      secret.expiresAtMs <= Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS;
    if (!expiresSoon) {
      return secret;
    }
    if (!secret.refreshToken?.trim()) {
      return secret;
    }

    const refreshed =
      secret.provider === "gmail"
        ? await refreshGoogleAccessToken({
            clientId: secret.clientId,
            clientSecret: secret.clientSecret,
            refreshToken: secret.refreshToken,
          })
        : await refreshMicrosoftAccessToken({
            clientId: secret.clientId,
            clientSecret: secret.clientSecret,
            refreshToken: secret.refreshToken,
          });

    const normalized = normalizeTokenSet(secret, refreshed);
    secrets.accounts[accountId] = normalized;
    await this.saveSecrets(secrets);
    return normalized;
  }

  async search(input: {
    accountId: string;
    query: string;
    limit: number;
  }): Promise<EmailMessageMeta[]> {
    const { account, secret, metadata, secrets } = await this.resolveAccount(input.accountId);
    try {
      if (secret.provider === "gmail") {
        const oauth = await this.getRefreshedOAuthSecret(account.id, secret, secrets);
        const rows = await gmailSearchMessages({
          accessToken: oauth.accessToken,
          query: input.query,
          limit: input.limit,
        });
        await this.setAccountStatus(metadata, account.id, "connected");
        return rows;
      }
      if (secret.provider === "microsoft") {
        const oauth = await this.getRefreshedOAuthSecret(account.id, secret, secrets);
        const rows = await graphSearchMessages({
          accessToken: oauth.accessToken,
          query: input.query,
          limit: input.limit,
        });
        await this.setAccountStatus(metadata, account.id, "connected");
        return rows;
      }
      if (!isImapSmtpSecret(secret)) {
        throw new Error(`unsupported provider: ${(secret as { provider?: string }).provider ?? "unknown"}`);
      }
      const rows = await imapSearchMessages({
        config: secret.config.imap,
        query: input.query,
        limit: input.limit,
      });
      await this.setAccountStatus(metadata, account.id, "connected");
      return rows;
    } catch (error) {
      await this.setAccountStatus(metadata, account.id, "error");
      rethrowSanitized(error);
    }
  }

  async get(input: { accountId: string; messageId: string }): Promise<EmailMessage> {
    const { account, secret, metadata, secrets } = await this.resolveAccount(input.accountId);
    try {
      if (secret.provider === "gmail") {
        const oauth = await this.getRefreshedOAuthSecret(account.id, secret, secrets);
        const result = await gmailGetMessage({
          accessToken: oauth.accessToken,
          messageId: input.messageId,
        });
        await this.setAccountStatus(metadata, account.id, "connected");
        return result;
      }
      if (secret.provider === "microsoft") {
        const oauth = await this.getRefreshedOAuthSecret(account.id, secret, secrets);
        const result = await graphGetMessage({
          accessToken: oauth.accessToken,
          messageId: input.messageId,
        });
        await this.setAccountStatus(metadata, account.id, "connected");
        return result;
      }
      if (!isImapSmtpSecret(secret)) {
        throw new Error(`unsupported provider: ${(secret as { provider?: string }).provider ?? "unknown"}`);
      }
      const result = await imapGetMessage({
        config: secret.config.imap,
        messageId: input.messageId,
      });
      await this.setAccountStatus(metadata, account.id, "connected");
      return result;
    } catch (error) {
      await this.setAccountStatus(metadata, account.id, "error");
      rethrowSanitized(error);
    }
  }

  async draftSend(input: { accountId: string; payload: EmailSendPayload }): Promise<{
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
  }> {
    const payload: EmailSendPayload = {
      to: normalizeEmailList(input.payload.to, "to"),
      cc: normalizeEmailList(input.payload.cc, "cc"),
      bcc: normalizeEmailList(input.payload.bcc, "bcc"),
      subject: String(input.payload.subject ?? "").trim(),
      bodyText: String(input.payload.bodyText ?? "").trim(),
    };

    if (payload.to.length === 0) {
      throw new Error("at least one recipient is required");
    }
    if (!payload.subject) {
      throw new Error("subject is required");
    }
    if (!payload.bodyText) {
      throw new Error("bodyText is required");
    }

    const { account } = await this.resolveAccount(input.accountId);
    const secrets = await this.loadSecrets();

    const draftId = randomUUID();
    const confirmationCode = makeConfirmationCode();
    const createdAtMs = Date.now();
    const expiresAtMs = createdAtMs + DRAFT_TTL_MS;

    secrets.drafts[draftId] = {
      draftId,
      accountId: account.id,
      to: payload.to,
      cc: payload.cc ?? [],
      bcc: payload.bcc ?? [],
      subject: payload.subject,
      bodyText: payload.bodyText,
      confirmationCode,
      createdAtMs,
      expiresAtMs,
    };

    await this.saveSecrets(secrets);

    return {
      draftId,
      confirmationCode,
      preview: {
        to: payload.to,
        cc: payload.cc ?? [],
        bcc: payload.bcc ?? [],
        subject: payload.subject,
        bodyText: payload.bodyText,
      },
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  async confirmSend(input: {
    draftId: string;
    confirmationCode: string;
  }): Promise<{
    sent: boolean;
    providerMessageId?: string;
  }> {
    const secrets = await this.loadSecrets();
    const draft = secrets.drafts[input.draftId];
    if (!draft) {
      throw new Error("draft not found or expired");
    }
    if (draft.expiresAtMs < Date.now()) {
      delete secrets.drafts[input.draftId];
      await this.saveSecrets(secrets);
      throw new Error("draft expired; create a new draft");
    }

    const expectedCode = draft.confirmationCode;
    const receivedCode = input.confirmationCode.trim();
    if (!receivedCode || receivedCode !== expectedCode) {
      throw new Error("invalid confirmation code");
    }

    const resolved = await this.resolveAccount(draft.accountId);
    const { account, secret, metadata } = resolved;

    try {
      let providerMessageId: string | undefined;
      if (secret.provider === "gmail") {
        const oauth = await this.getRefreshedOAuthSecret(account.id, secret, secrets);
        const sendResult = await gmailSendMessage({
          accessToken: oauth.accessToken,
          from: account.address,
          payload: {
            to: draft.to,
            cc: draft.cc,
            bcc: draft.bcc,
            subject: draft.subject,
            bodyText: draft.bodyText,
          },
        });
        providerMessageId = sendResult.messageId;
      } else if (secret.provider === "microsoft") {
        const oauth = await this.getRefreshedOAuthSecret(account.id, secret, secrets);
        const sendResult = await graphSendMessage({
          accessToken: oauth.accessToken,
          payload: {
            to: draft.to,
            cc: draft.cc,
            bcc: draft.bcc,
            subject: draft.subject,
            bodyText: draft.bodyText,
          },
        });
        providerMessageId = sendResult.messageId;
      } else {
        if (!isImapSmtpSecret(secret)) {
          throw new Error(
            `unsupported provider: ${(secret as { provider?: string }).provider ?? "unknown"}`,
          );
        }
        const sendResult = await smtpSendMessage({
          config: secret.config.smtp,
          from: {
            address: secret.config.address,
            name: secret.config.displayName,
          },
          payload: {
            to: draft.to,
            cc: draft.cc,
            bcc: draft.bcc,
            subject: draft.subject,
            bodyText: draft.bodyText,
          },
        });
        providerMessageId = sendResult.messageId;
      }

      delete secrets.drafts[input.draftId];
      await Promise.all([this.saveSecrets(secrets), this.setAccountStatus(metadata, account.id, "connected")]);
      return {
        sent: true,
        providerMessageId,
      };
    } catch (error) {
      await this.setAccountStatus(metadata, account.id, "error");
      rethrowSanitized(error);
    }
  }
}
