import type { IncomingMessage, ServerResponse } from "node:http";
import { getGatewayEmailService } from "./email/registry.js";

function sendHtml(res: ServerResponse, status: number, title: string, body: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b1120; color: #e2e8f0; margin: 0; padding: 24px; }
      .card { max-width: 560px; margin: 48px auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      p { margin: 8px 0; color: #cbd5e1; white-space: pre-wrap; }
      .ok { color: #86efac; }
      .err { color: #fca5a5; }
      code { background: #0f172a; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${body}</p>
      <p>Return to Medha Control UI and refresh Email accounts.</p>
    </div>
    <script>
      setTimeout(() => {
        if (window.opener) {
          window.close();
        }
      }, 1200);
    </script>
  </body>
</html>`);
}

function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[<>]/g, "");
}

export async function handleEmailOAuthCallbackRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (req.method !== "GET") {
    return false;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const provider =
    url.pathname === "/oauth/google/callback"
      ? "gmail"
      : url.pathname === "/oauth/microsoft/callback"
        ? "microsoft"
        : null;

  if (!provider) {
    return false;
  }

  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const oauthError = url.searchParams.get("error")?.trim();

  if (oauthError) {
    sendHtml(res, 400, "OAuth Authorization Failed", `<span class="err">${oauthError}</span>`);
    return true;
  }

  if (!state || !code) {
    sendHtml(
      res,
      400,
      "OAuth Callback Invalid",
      '<span class="err">Missing required <code>state</code> or <code>code</code>.</span>',
    );
    return true;
  }

  try {
    const service = await getGatewayEmailService();
    const account = await service.completeOAuthCallback({
      provider,
      state,
      code,
    });
    sendHtml(
      res,
      200,
      "Email Account Connected",
      `<span class="ok">Connected ${account.provider}</span> for <code>${account.address}</code>.`,
    );
    return true;
  } catch (error) {
    sendHtml(
      res,
      400,
      "Email OAuth Failed",
      `<span class="err">${safeMessage(error)}</span>`,
    );
    return true;
  }
}
