import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { sanitizeEmailBody, sanitizeHeadersSubset } from "../../email-core/src/index.js";
import type { EmailMessage, EmailMessageMeta, EmailSendPayload } from "../../email-core/src/index.js";

export type ImapSmtpProviderPresetId =
  | "gmail"
  | "outlook"
  | "yahoo"
  | "icloud"
  | "zoho"
  | "fastmail"
  | "proton-bridge"
  | "custom";

export type ImapConnectionConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  oauth2Token?: string;
};

export type SmtpConnectionConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  oauth2Token?: string;
  rejectUnauthorized?: boolean;
};

export type ImapSmtpAccountConfig = {
  preset: ImapSmtpProviderPresetId;
  address: string;
  displayName?: string;
  imap: ImapConnectionConfig;
  smtp: SmtpConnectionConfig;
  allowPasswordAuth: boolean;
  protonBridgeHintAccepted?: boolean;
};

export const IMAP_SMTP_PRESETS: Record<
  Exclude<ImapSmtpProviderPresetId, "custom">,
  {
    label: string;
    imap: Pick<ImapConnectionConfig, "host" | "port" | "secure">;
    smtp: Pick<SmtpConnectionConfig, "host" | "port" | "secure">;
    note?: string;
  }
> = {
  gmail: {
    label: "Gmail",
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    note: "Use app password or XOAUTH2 token.",
  },
  outlook: {
    label: "Outlook / Office365",
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
  },
  yahoo: {
    label: "Yahoo",
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
  },
  icloud: {
    label: "iCloud",
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    note: "Use app-specific password.",
  },
  zoho: {
    label: "Zoho",
    imap: { host: "imap.zoho.com", port: 993, secure: true },
    smtp: { host: "smtp.zoho.com", port: 465, secure: true },
  },
  fastmail: {
    label: "Fastmail",
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
  },
  "proton-bridge": {
    label: "Proton Bridge",
    imap: { host: "127.0.0.1", port: 1143, secure: false },
    smtp: { host: "127.0.0.1", port: 1025, secure: false },
    note: "Requires Proton Bridge running locally.",
  },
};

function validateRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function normalizeAddressList(values: string[] | undefined): string[] {
  return (values ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
}

function resolveImapAuth(config: ImapConnectionConfig) {
  if (config.oauth2Token?.trim()) {
    return {
      user: config.username,
      accessToken: config.oauth2Token.trim(),
      method: "XOAUTH2" as const,
    };
  }
  const password = config.password?.trim();
  if (!password) {
    throw new Error("IMAP password (or oauth2Token) is required");
  }
  return {
    user: config.username,
    pass: password,
  };
}

function resolveSmtpAuth(config: SmtpConnectionConfig) {
  if (config.oauth2Token?.trim()) {
    return {
      type: "OAuth2" as const,
      user: config.username,
      accessToken: config.oauth2Token.trim(),
    };
  }
  const password = config.password?.trim();
  if (!password) {
    throw new Error("SMTP password (or oauth2Token) is required");
  }
  return {
    user: config.username,
    pass: password,
  };
}

async function withImapClient<T>(config: ImapConnectionConfig, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: validateRequired(config.host, "imap.host"),
    port: config.port,
    secure: config.secure,
    auth: resolveImapAuth(config),
    logger: false,
  });

  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function testImapConnection(config: ImapConnectionConfig): Promise<void> {
  await withImapClient(config, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  });
}

export async function testSmtpConnection(config: SmtpConnectionConfig): Promise<void> {
  const transport = nodemailer.createTransport({
    host: validateRequired(config.host, "smtp.host"),
    port: config.port,
    secure: config.secure,
    auth: resolveSmtpAuth(config),
    tls: {
      rejectUnauthorized: config.rejectUnauthorized ?? true,
    },
  });
  await transport.verify();
}

export async function imapSearchMessages(input: {
  config: ImapConnectionConfig;
  query: string;
  limit: number;
}): Promise<EmailMessageMeta[]> {
  const limit = Math.max(1, Math.min(25, Math.floor(input.limit || 10)));
  return await withImapClient(input.config, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const query = input.query.trim();
      const searchResult = query
        ? await client.search({ text: query })
        : await client.search({ all: true });
      const uids = Array.isArray(searchResult) ? searchResult : [];
      const sorted = uids.toSorted((a, b) => b - a).slice(0, limit);
      const out: EmailMessageMeta[] = [];
      for (const uid of sorted) {
        const message = await client.fetchOne(uid, {
          uid: true,
          envelope: true,
          bodyStructure: true,
          source: true,
          internalDate: true,
        });
        if (!message) {
          continue;
        }
        const parsed = await simpleParser(message.source);
        const fromAddress = parsed.from?.text?.trim() || "Unknown";
        const subject = parsed.subject?.trim() || "(No subject)";
        const snippetRaw = (parsed.text || parsed.html || "").replace(/\s+/g, " ").trim();
        out.push({
          id: String(uid),
          threadId: undefined,
          from: fromAddress,
          subject,
          date: new Date(message.internalDate ?? Date.now()).toISOString(),
          snippet: snippetRaw.length > 180 ? `${snippetRaw.slice(0, 180)}…` : snippetRaw,
        });
      }
      return out;
    } finally {
      lock.release();
    }
  });
}

export async function imapGetMessage(input: {
  config: ImapConnectionConfig;
  messageId: string;
}): Promise<EmailMessage> {
  const uid = Number.parseInt(input.messageId, 10);
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error("messageId must be a positive IMAP UID");
  }
  return await withImapClient(input.config, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const message = await client.fetchOne(uid, {
        uid: true,
        envelope: true,
        source: true,
        internalDate: true,
      });
      if (!message) {
        throw new Error(`message not found for UID ${uid}`);
      }
      const parsed = await simpleParser(message.source);
      const headers: Record<string, string> = {};
      for (const [key, value] of parsed.headers.entries()) {
        if (typeof value === "string") {
          headers[String(key).toLowerCase()] = value;
        }
      }

      const bodyText = sanitizeEmailBody(
        {
          text: parsed.text ?? undefined,
          html: typeof parsed.html === "string" ? parsed.html : undefined,
        },
        { maxTextChars: 25_000 },
      );

      const snippet = bodyText.length > 180 ? `${bodyText.slice(0, 180)}…` : bodyText;
      const from = parsed.from?.text?.trim() || headers.from || "Unknown";
      const subject = parsed.subject?.trim() || headers.subject || "(No subject)";

      return {
        meta: {
          id: String(uid),
          threadId: undefined,
          from,
          subject,
          date: new Date(message.internalDate ?? Date.now()).toISOString(),
          snippet,
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
    } finally {
      lock.release();
    }
  });
}

export async function smtpSendMessage(input: {
  config: SmtpConnectionConfig;
  from: { address: string; name?: string };
  payload: EmailSendPayload;
}): Promise<{ messageId?: string }> {
  const to = normalizeAddressList(input.payload.to);
  if (to.length === 0) {
    throw new Error("at least one recipient is required");
  }

  const transport = nodemailer.createTransport({
    host: validateRequired(input.config.host, "smtp.host"),
    port: input.config.port,
    secure: input.config.secure,
    auth: resolveSmtpAuth(input.config),
    tls: {
      rejectUnauthorized: input.config.rejectUnauthorized ?? true,
    },
  });

  const result = await transport.sendMail({
    from: input.from.name ? `"${input.from.name.replace(/"/g, "\\\"")}" <${input.from.address}>` : input.from.address,
    to,
    cc: normalizeAddressList(input.payload.cc),
    bcc: normalizeAddressList(input.payload.bcc),
    subject: input.payload.subject,
    text: input.payload.bodyText,
  });

  return { messageId: result.messageId || undefined };
}
