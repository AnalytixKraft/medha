import { Type } from "@sinclair/typebox";
import type { MedhaConfig } from "../../config/config.js";
import { stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

const EMAIL_ACTIONS = [
  "accounts_list",
  "accounts_connect_google",
  "accounts_connect_microsoft",
  "accounts_connect_imap_smtp",
  "search",
  "get",
  "draft_send",
  "drafts_list",
] as const;

const EmailToolSchema = Type.Object({
  action: Type.Optional(stringEnum(EMAIL_ACTIONS)),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),

  // accounts_connect_google / accounts_connect_microsoft
  redirectUri: Type.Optional(Type.String()),
  clientId: Type.Optional(Type.String()),
  clientSecret: Type.Optional(Type.String()),

  // accounts_connect_imap_smtp
  address: Type.Optional(Type.String()),
  displayName: Type.Optional(Type.String()),
  preset: Type.Optional(Type.String()),
  allowPasswordAuth: Type.Optional(Type.Boolean()),
  protonBridgeHintAccepted: Type.Optional(Type.Boolean()),
  testRead: Type.Optional(Type.Boolean()),
  testSend: Type.Optional(Type.Boolean()),
  imap: Type.Optional(
    Type.Object(
      {
        host: Type.String(),
        port: Type.Number(),
        secure: Type.Boolean(),
        username: Type.String(),
        password: Type.Optional(Type.String()),
        oauth2Token: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
  ),
  smtp: Type.Optional(
    Type.Object(
      {
        host: Type.String(),
        port: Type.Number(),
        secure: Type.Boolean(),
        username: Type.String(),
        password: Type.Optional(Type.String()),
        oauth2Token: Type.Optional(Type.String()),
        rejectUnauthorized: Type.Optional(Type.Boolean()),
      },
      { additionalProperties: false },
    ),
  ),

  // search/get/draft_send
  accountId: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
  messageId: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
  cc: Type.Optional(Type.String()),
  bcc: Type.Optional(Type.String()),
  subject: Type.Optional(Type.String()),
  bodyText: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
});

function parseEmailListCsv(value: string | undefined, label: string, required = false): string[] {
  const raw = (value ?? "").trim();
  if (!raw) {
    if (required) {
      throw new Error(`${label} is required`);
    }
    return [];
  }
  const items = raw
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (required && items.length === 0) {
    throw new Error(`${label} is required`);
  }
  return items;
}

function resolveAction(params: Record<string, unknown>): (typeof EMAIL_ACTIONS)[number] {
  const explicit = readStringParam(params, "action");
  if (explicit) {
    if (EMAIL_ACTIONS.includes(explicit as (typeof EMAIL_ACTIONS)[number])) {
      return explicit as (typeof EMAIL_ACTIONS)[number];
    }
    throw new Error(`unsupported action: ${explicit}`);
  }

  const hasLegacyDraft =
    typeof params.to === "string" &&
    params.to.trim() &&
    typeof params.subject === "string" &&
    params.subject.trim() &&
    (typeof params.bodyText === "string" || typeof params.body === "string");
  if (hasLegacyDraft) {
    return "draft_send";
  }

  return "accounts_list";
}

export function createEmailTool(_opts?: { config?: MedhaConfig }): AnyAgentTool {
  return {
    label: "Email",
    name: "send_email",
    description:
      "Email operations via gateway-managed providers. Supports account list/connect, inbox search/get, and draft_send. Final send confirmation is restricted to Control UI.",
    parameters: EmailToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = resolveAction(params);
      const gatewayOpts = readGatewayCallOptions(params);

      if (action === "accounts_list") {
        const result = await callGatewayTool("email.accounts.list", gatewayOpts, {});
        return jsonResult({ ok: true, result });
      }

      if (action === "accounts_connect_google") {
        const redirectUri = readStringParam(params, "redirectUri", { required: true });
        const result = await callGatewayTool("email.accounts.connect.google", gatewayOpts, {
          redirectUri,
          clientId: readStringParam(params, "clientId"),
          clientSecret: readStringParam(params, "clientSecret"),
        });
        return jsonResult({ ok: true, result });
      }

      if (action === "accounts_connect_microsoft") {
        const redirectUri = readStringParam(params, "redirectUri", { required: true });
        const result = await callGatewayTool("email.accounts.connect.microsoft", gatewayOpts, {
          redirectUri,
          clientId: readStringParam(params, "clientId"),
          clientSecret: readStringParam(params, "clientSecret"),
        });
        return jsonResult({ ok: true, result });
      }

      if (action === "accounts_connect_imap_smtp") {
        const address = readStringParam(params, "address", { required: true });
        const imap = params.imap;
        const smtp = params.smtp;
        if (!imap || typeof imap !== "object" || Array.isArray(imap)) {
          throw new Error("imap object is required");
        }
        if (!smtp || typeof smtp !== "object" || Array.isArray(smtp)) {
          throw new Error("smtp object is required");
        }
        const result = await callGatewayTool("email.accounts.connect.imapSmtp", gatewayOpts, {
          address,
          displayName: readStringParam(params, "displayName"),
          preset: readStringParam(params, "preset"),
          allowPasswordAuth: params.allowPasswordAuth,
          protonBridgeHintAccepted: params.protonBridgeHintAccepted,
          testRead: params.testRead,
          testSend: params.testSend,
          imap,
          smtp,
        });
        return jsonResult({ ok: true, result });
      }

      if (action === "search") {
        const accountId = readStringParam(params, "accountId");
        const query = readStringParam(params, "query") ?? "";
        const limit = readNumberParam(params, "limit") ?? 10;
        const result = await callGatewayTool("email.messages.search", gatewayOpts, {
          accountId,
          query,
          limit,
        });
        return jsonResult({ ok: true, result });
      }

      if (action === "get") {
        const accountId = readStringParam(params, "accountId");
        const messageId = readStringParam(params, "messageId", { required: true });
        const result = await callGatewayTool("email.messages.get", gatewayOpts, {
          accountId,
          messageId,
        });
        return jsonResult({ ok: true, result });
      }

      if (action === "draft_send") {
        const accountId = readStringParam(params, "accountId");
        const to = parseEmailListCsv(readStringParam(params, "to"), "to", true);
        const cc = parseEmailListCsv(readStringParam(params, "cc"), "cc", false);
        const bcc = parseEmailListCsv(readStringParam(params, "bcc"), "bcc", false);
        const subject = readStringParam(params, "subject", { required: true });
        const bodyText =
          readStringParam(params, "bodyText") ?? readStringParam(params, "body", { required: true });

        const result = await callGatewayTool("email.send.draft", gatewayOpts, {
          accountId,
          to,
          cc,
          bcc,
          subject,
          bodyText,
        });
        return jsonResult({ ok: true, result });
      }

      const result = await callGatewayTool("email.drafts.list", gatewayOpts, {});
      return jsonResult({ ok: true, result });
    },
  };
}
