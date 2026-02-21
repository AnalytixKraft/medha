import { callGateway } from "../src/gateway/call.js";

type CliArgs = {
  url?: string;
  token?: string;
  password?: string;
  accountId?: string;
  query: string;
  limit: number;
  to?: string;
  subject: string;
  body: string;
  confirmCode?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    query: "",
    limit: 10,
    subject: "Medha Email Smoke Test",
    body: "Smoke test draft from Medha.",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--url" && next) {
      args.url = next;
      i++;
      continue;
    }
    if (arg === "--token" && next) {
      args.token = next;
      i++;
      continue;
    }
    if (arg === "--password" && next) {
      args.password = next;
      i++;
      continue;
    }
    if (arg === "--account" && next) {
      args.accountId = next;
      i++;
      continue;
    }
    if (arg === "--query" && next) {
      args.query = next;
      i++;
      continue;
    }
    if (arg === "--limit" && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed)) {
        args.limit = Math.max(1, Math.min(25, Math.floor(parsed)));
      }
      i++;
      continue;
    }
    if (arg === "--to" && next) {
      args.to = next;
      i++;
      continue;
    }
    if (arg === "--subject" && next) {
      args.subject = next;
      i++;
      continue;
    }
    if (arg === "--body" && next) {
      args.body = next;
      i++;
      continue;
    }
    if (arg === "--confirm-code" && next) {
      args.confirmCode = next;
      i++;
      continue;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gatewayOpts = {
    url: args.url,
    token: args.token,
    password: args.password,
    timeoutMs: 15_000,
  };

  const accountsResponse = await callGateway<{ accounts?: Array<{ id: string; address: string; provider: string }> }>({
    ...gatewayOpts,
    method: "email.accounts.list",
    params: {},
  });
  const accounts = Array.isArray(accountsResponse.accounts) ? accountsResponse.accounts : [];
  if (accounts.length === 0) {
    throw new Error("No email accounts connected.");
  }

  const accountId = args.accountId?.trim() || accounts[0]?.id;
  if (!accountId) {
    throw new Error("No accountId resolved.");
  }

  const messagesResponse = await callGateway<{ messages?: Array<{ id: string; subject: string; from: string; date: string }> }>({
    ...gatewayOpts,
    method: "email.messages.search",
    params: {
      accountId,
      query: args.query,
      limit: args.limit,
    },
  });
  const messages = Array.isArray(messagesResponse.messages) ? messagesResponse.messages : [];
  console.log(`Account: ${accountId}`);
  console.log(`Messages: ${messages.length}`);
  for (const item of messages.slice(0, 10)) {
    console.log(`- ${item.date} | ${item.from} | ${item.subject}`);
  }

  if (!args.to) {
    console.log("Draft step skipped. Pass --to <email> to run draft/confirm flow.");
    return;
  }

  const draftResponse = await callGateway<{
    draftId: string;
    confirmationCode: string;
    preview: { to: string[]; cc: string[]; bcc: string[]; subject: string; bodyText: string };
    expiresAt: string;
  }>({
    ...gatewayOpts,
    method: "email.send.draft",
    params: {
      accountId,
      to: [args.to],
      cc: [],
      bcc: [],
      subject: args.subject,
      bodyText: args.body,
    },
  });

  console.log("Draft created:");
  console.log(JSON.stringify(draftResponse, null, 2));

  const confirmCode = args.confirmCode?.trim();
  if (!confirmCode) {
    console.log("Confirm step skipped. Re-run with --confirm-code <code>.");
    return;
  }

  const confirmResponse = await callGateway<{ sent: boolean; providerMessageId?: string }>({
    ...gatewayOpts,
    method: "email.send.confirm",
    params: {
      draftId: draftResponse.draftId,
      confirmationCode: confirmCode,
    },
  });
  console.log("Send result:");
  console.log(JSON.stringify(confirmResponse, null, 2));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
