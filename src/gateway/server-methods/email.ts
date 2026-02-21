import { isControlUiClientId } from "../protocol/client-info.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { getGatewayEmailService } from "../email/registry.js";
import type { GatewayRequestHandlers } from "./types.js";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(
  value: unknown,
  label: string,
  options?: { required?: boolean; allowEmpty?: boolean },
): string | undefined {
  if (typeof value !== "string") {
    if (options?.required) {
      throw new Error(`${label} is required`);
    }
    return undefined;
  }
  const trimmed = options?.allowEmpty ? value : value.trim();
  if (!trimmed && options?.required) {
    throw new Error(`${label} is required`);
  }
  return trimmed || undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number`);
  }
  return parsed;
}

function readStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value
    .map((item) => {
      if (typeof item !== "string") {
        throw new Error(`${label} must contain only strings`);
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);
}

function ensureControlUiClient(client: { connect?: { client?: { id?: string } } } | null): boolean {
  const clientId = client?.connect?.client?.id;
  return isControlUiClientId(clientId);
}

async function resolveAccountIdOrDefault(
  service: Awaited<ReturnType<typeof getGatewayEmailService>>,
  rawAccountId: unknown,
): Promise<string> {
  const explicit = readString(rawAccountId, "accountId");
  if (explicit) {
    return explicit;
  }
  const accounts = await service.listAccounts();
  const first = accounts[0]?.id;
  if (!first) {
    throw new Error("no email accounts connected");
  }
  return first;
}

export const emailHandlers: GatewayRequestHandlers = {
  "email.accounts.list": async ({ respond }) => {
    try {
      const service = await getGatewayEmailService();
      const accounts = await service.listAccounts();
      respond(true, { accounts }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.accounts.remove": async ({ params, respond }) => {
    try {
      const accountId = readString((params as { accountId?: unknown }).accountId, "accountId", {
        required: true,
      })!;
      const service = await getGatewayEmailService();
      const result = await service.removeAccount(accountId);
      respond(true, result, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.accounts.connect.google": async ({ params, respond }) => {
    try {
      const p = asObject(params);
      const service = await getGatewayEmailService();
      const result = await service.startGoogleOAuth({
        redirectUri: readString(p.redirectUri, "redirectUri", { required: true })!,
        clientId: readString(p.clientId, "clientId"),
        clientSecret: readString(p.clientSecret, "clientSecret"),
      });
      respond(true, result, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.accounts.connect.microsoft": async ({ params, respond }) => {
    try {
      const p = asObject(params);
      const service = await getGatewayEmailService();
      const result = await service.startMicrosoftOAuth({
        redirectUri: readString(p.redirectUri, "redirectUri", { required: true })!,
        clientId: readString(p.clientId, "clientId"),
        clientSecret: readString(p.clientSecret, "clientSecret"),
      });
      respond(true, result, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.accounts.connect.imapSmtp": async ({ params, respond }) => {
    try {
      const p = asObject(params);
      const imap = asObject(p.imap);
      const smtp = asObject(p.smtp);
      const service = await getGatewayEmailService();
      const result = await service.connectImapSmtp({
        address: readString(p.address, "address", { required: true })!,
        displayName: readString(p.displayName, "displayName"),
        preset: readString(p.preset, "preset") as
          | "gmail"
          | "outlook"
          | "yahoo"
          | "icloud"
          | "zoho"
          | "fastmail"
          | "proton-bridge"
          | "custom"
          | undefined,
        allowPasswordAuth: readBoolean(p.allowPasswordAuth),
        protonBridgeHintAccepted: readBoolean(p.protonBridgeHintAccepted),
        testRead: readBoolean(p.testRead),
        testSend: readBoolean(p.testSend),
        imap: {
          host: readString(imap.host, "imap.host", { required: true })!,
          port: readNumber(imap.port, "imap.port"),
          secure: readBoolean(imap.secure) ?? true,
          username: readString(imap.username, "imap.username", { required: true })!,
          password: readString(imap.password, "imap.password"),
          oauth2Token: readString(imap.oauth2Token, "imap.oauth2Token"),
        },
        smtp: {
          host: readString(smtp.host, "smtp.host", { required: true })!,
          port: readNumber(smtp.port, "smtp.port"),
          secure: readBoolean(smtp.secure) ?? true,
          username: readString(smtp.username, "smtp.username", { required: true })!,
          password: readString(smtp.password, "smtp.password"),
          oauth2Token: readString(smtp.oauth2Token, "smtp.oauth2Token"),
          rejectUnauthorized: readBoolean(smtp.rejectUnauthorized),
        },
      });
      respond(true, { account: result }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.messages.search": async ({ params, respond }) => {
    try {
      const p = asObject(params);
      const service = await getGatewayEmailService();
      const messages = await service.search({
        accountId: await resolveAccountIdOrDefault(service, p.accountId),
        query: readString(p.query, "query") ?? "",
        limit: Number.isFinite(Number(p.limit)) ? Math.floor(Number(p.limit)) : 10,
      });
      respond(true, { messages }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.messages.get": async ({ params, respond }) => {
    try {
      const p = asObject(params);
      const service = await getGatewayEmailService();
      const message = await service.get({
        accountId: await resolveAccountIdOrDefault(service, p.accountId),
        messageId: readString(p.messageId, "messageId", { required: true })!,
      });
      respond(true, { message }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.send.draft": async ({ params, respond }) => {
    try {
      const p = asObject(params);
      const service = await getGatewayEmailService();
      const draft = await service.draftSend({
        accountId: await resolveAccountIdOrDefault(service, p.accountId),
        payload: {
          to: readStringList(p.to, "to"),
          cc: Array.isArray(p.cc) ? readStringList(p.cc, "cc") : [],
          bcc: Array.isArray(p.bcc) ? readStringList(p.bcc, "bcc") : [],
          subject: readString(p.subject, "subject", { required: true })!,
          bodyText: readString(p.bodyText, "bodyText", { required: true, allowEmpty: true }) ?? "",
        },
      });
      respond(true, draft, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.send.confirm": async ({ params, respond, client }) => {
    try {
      if (!ensureControlUiClient(client)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "email.send.confirm is restricted to Control UI"),
        );
        return;
      }
      const p = asObject(params);
      const service = await getGatewayEmailService();
      const result = await service.confirmSend({
        draftId: readString(p.draftId, "draftId", { required: true })!,
        confirmationCode: readString(p.confirmationCode, "confirmationCode", { required: true })!,
      });
      respond(true, result, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },

  "email.drafts.list": async ({ respond }) => {
    try {
      const service = await getGatewayEmailService();
      const drafts = await service.listPendingDrafts();
      respond(true, { drafts }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
};
