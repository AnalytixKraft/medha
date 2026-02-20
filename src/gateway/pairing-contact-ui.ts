import type { IncomingMessage, ServerResponse } from "node:http";
import { listPairingChannels, resolvePairingChannel } from "../channels/plugins/pairing.js";
import {
  addChannelAllowFromStoreEntry,
  readChannelAllowFromStore,
  removeChannelAllowFromStoreEntry,
} from "../pairing/pairing-store.js";
import type { GatewayAuthResult } from "./auth.js";
import { buildControlUiCspHeader } from "./control-ui-csp.js";
import { normalizeControlUiBasePath } from "./control-ui-shared.js";

const PAIRING_CONTACT_SEGMENT = "/pairing-contact";
const PAIRING_CONTACT_APP_SEGMENT = "/pairing-contact/app.js";
const PAIRING_CONTACT_API_SEGMENT = "/pairing-contact/api";
const MAX_BODY_BYTES = 64 * 1024;

type PairingContactUiPaths = {
  homePath: string;
  pagePath: string;
  appPath: string;
  apiRoot: string;
};

type PairingContactUiOptions = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  basePath?: string;
  authorizeApiRequest: (req: IncomingMessage) => Promise<GatewayAuthResult>;
  onApiAuthFailure: (res: ServerResponse, auth: GatewayAuthResult) => void;
};

function jsonContentType(res: ServerResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function textContentType(res: ServerResponse) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
}

function htmlContentType(res: ServerResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
}

function jsContentType(res: ServerResponse) {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
}

function applySecurityHeaders(res: ServerResponse) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", buildControlUiCspHeader());
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-cache");
  jsonContentType(res);
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, status: number, body: string) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-cache");
  textContentType(res);
  res.end(body);
}

function withBase(basePath: string, segment: string): string {
  return basePath ? `${basePath}${segment}` : segment;
}

function resolvePaths(basePath?: string): PairingContactUiPaths {
  const normalized = normalizeControlUiBasePath(basePath);
  return {
    homePath: normalized ? `${normalized}/` : "/",
    pagePath: withBase(normalized, PAIRING_CONTACT_SEGMENT),
    appPath: withBase(normalized, PAIRING_CONTACT_APP_SEGMENT),
    apiRoot: withBase(normalized, PAIRING_CONTACT_API_SEGMENT),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      total += Buffer.byteLength(chunk);
      if (total > maxBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", (err) => reject(err));
  });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw.trim()) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!isObject(parsed)) {
    throw new Error("body must be an object");
  }
  return parsed;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireTextField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function renderPairingContactHtml(paths: PairingContactUiPaths): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Medha Pair Contact</title>
    <style>
      :root {
        --bg: #0c1220;
        --panel: #141c2f;
        --panel-2: #1b2741;
        --text: #edf2ff;
        --muted: #9eb2d8;
        --ok: #21c780;
        --warn: #f5a524;
        --err: #ef5350;
        --line: #2a395b;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(1200px 800px at 20% -10%, #1d2f52, var(--bg));
        color: var(--text);
      }
      .wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 20px;
      }
      .panel {
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 14px;
      }
      .menu {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .menu a {
        display: inline-block;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 8px 12px;
        color: var(--text);
        text-decoration: none;
        background: #101a2c;
      }
      .menu a.active {
        background: #1d2f52;
      }
      h1, h2 {
        margin: 0 0 10px 0;
      }
      h1 {
        font-size: 1.25rem;
      }
      h2 {
        font-size: 1rem;
        color: var(--muted);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
      }
      label {
        display: block;
        font-size: 0.85rem;
        color: var(--muted);
        margin-bottom: 6px;
      }
      input, select, button {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px;
        background: #0f1728;
        color: var(--text);
      }
      button {
        cursor: pointer;
        background: #17335f;
      }
      button.secondary {
        background: #20304f;
      }
      button.inline {
        width: auto;
        padding: 6px 10px;
      }
      .status {
        margin-top: 10px;
        font-size: 0.9rem;
      }
      .status.ok { color: var(--ok); }
      .status.warn { color: var(--warn); }
      .status.err { color: var(--err); }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      th, td {
        border-bottom: 1px solid var(--line);
        text-align: left;
        padding: 8px;
        vertical-align: top;
      }
      code {
        font-size: 0.85rem;
      }
      .muted {
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="panel menu" aria-label="Main menu">
        <a data-preserve-hash="1" href="${paths.homePath}">Dashboard</a>
        <a class="active" href="${paths.pagePath}">Pair Contact</a>
      </div>

      <div class="panel">
        <h1>Pair Contact</h1>
        <div class="muted">Manually allow contacts only. Unknown senders stay blocked.</div>
      </div>

      <div class="panel">
        <h2>Connection</h2>
        <div class="grid">
          <div>
            <label for="token">Gateway Token</label>
            <input id="token" placeholder="Paste token from dashboard URL (#token=...)" />
          </div>
          <div>
            <label for="channel">Channel</label>
            <select id="channel"></select>
          </div>
          <div>
            <label for="accountId">Account ID (optional)</label>
            <input id="accountId" placeholder="default" />
          </div>
        </div>
        <div class="grid" style="margin-top: 10px;">
          <button id="refreshBtn">Refresh</button>
        </div>
        <div id="status" class="status"></div>
      </div>

      <div class="panel">
        <h2>Manual Add Contact</h2>
        <div class="grid">
          <div>
            <label for="contactId">Contact ID / Phone</label>
            <input id="contactId" placeholder="+15551234567 or channel id" />
          </div>
          <div>
            <label>&nbsp;</label>
            <button id="addBtn">Add To Allowlist</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Current Allowlist</h2>
        <table>
          <thead>
            <tr>
              <th>Entry</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="allowBody"></tbody>
        </table>
      </div>
    </div>
    <script type="module" src="${paths.appPath}"></script>
  </body>
</html>`;
}

function renderPairingContactScript(): string {
  return `const statusEl = document.getElementById("status");
const tokenInput = document.getElementById("token");
const channelSelect = document.getElementById("channel");
const accountIdInput = document.getElementById("accountId");
const allowBody = document.getElementById("allowBody");
const addBtn = document.getElementById("addBtn");
const refreshBtn = document.getElementById("refreshBtn");
const contactIdInput = document.getElementById("contactId");

function apiRoot() {
  const noSlash = window.location.pathname.replace(/\\/+$/, "");
  return noSlash + "/api";
}

function setStatus(message, level = "ok") {
  statusEl.textContent = message;
  statusEl.className = "status " + level;
}

function currentToken() {
  return tokenInput.value.trim();
}

function currentChannel() {
  return channelSelect.value.trim();
}

function currentAccountId() {
  return accountIdInput.value.trim();
}

function restoreSavedGatewayToken() {
  try {
    const keys = ["openclaw.control.settings.v1", "medha.control.settings.v1"];
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.token !== "string") {
        continue;
      }
      const token = parsed.token.trim();
      if (token) {
        return token;
      }
    }
    return "";
  } catch {
    return "";
  }
}

function preserveHashForMenuLinks() {
  const hash = window.location.hash || "";
  if (!hash) {
    return;
  }
  const links = document.querySelectorAll("a[data-preserve-hash='1']");
  for (const link of links) {
    const currentHref = link.getAttribute("href");
    if (!currentHref || currentHref.includes("#")) {
      continue;
    }
    link.setAttribute("href", currentHref + hash);
  }
}

async function apiRequest(path, options = {}) {
  const headers = { Accept: "application/json" };
  const token = currentToken();
  if (token) {
    headers.Authorization = "Bearer " + token;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(apiRoot() + path, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    if (response.status === 401 && !token) {
      throw new Error("Gateway token missing. Open dashboard with #token and reload this page.");
    }
    const msg = payload && payload.error ? String(payload.error) : "Request failed (" + response.status + ")";
    throw new Error(msg);
  }
  return payload;
}

function row(columns) {
  const tr = document.createElement("tr");
  for (const value of columns) {
    const td = document.createElement("td");
    if (value instanceof Node) {
      td.appendChild(value);
    } else {
      td.textContent = String(value ?? "");
    }
    tr.appendChild(td);
  }
  return tr;
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

async function loadChannels() {
  const res = await apiRequest("/channels");
  const channels = Array.isArray(res.channels) ? res.channels : [];
  clearChildren(channelSelect);
  for (const ch of channels) {
    const opt = document.createElement("option");
    opt.value = String(ch);
    opt.textContent = String(ch);
    channelSelect.appendChild(opt);
  }
  if (channels.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No pairing channels found";
    channelSelect.appendChild(opt);
  }
}

async function loadAllowlist() {
  const channel = currentChannel();
  if (!channel) {
    clearChildren(allowBody);
    return;
  }
  const accountId = currentAccountId();
  const q = new URLSearchParams({ channel });
  if (accountId) q.set("accountId", accountId);
  const res = await apiRequest("/allow?" + q.toString());
  const allowFrom = Array.isArray(res.allowFrom) ? res.allowFrom : [];
  clearChildren(allowBody);
  if (allowFrom.length === 0) {
    allowBody.appendChild(row(["No contacts paired yet", "-"]));
    return;
  }
  for (const entry of allowFrom) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "inline secondary";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", async () => {
      try {
        await apiRequest("/remove", {
          method: "POST",
          body: { channel, accountId, id: String(entry || "") },
        });
        setStatus("Removed " + String(entry || ""), "ok");
        await refreshAll();
      } catch (err) {
        setStatus(String(err instanceof Error ? err.message : err), "err");
      }
    });
    allowBody.appendChild(row([String(entry), removeBtn]));
  }
}

async function refreshAll() {
  await loadAllowlist();
}

async function bootstrap() {
  preserveHashForMenuLinks();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const tokenFromHash = hashParams.get("token");
  if (tokenFromHash) {
    tokenInput.value = tokenFromHash;
  }
  if (!currentToken()) {
    tokenInput.value = restoreSavedGatewayToken();
  }

  try {
    await loadChannels();
    await refreshAll();
    setStatus("Ready", "ok");
  } catch (err) {
    setStatus(String(err instanceof Error ? err.message : err), "warn");
  }
}

refreshBtn.addEventListener("click", async () => {
  try {
    await refreshAll();
    setStatus("Refreshed", "ok");
  } catch (err) {
    setStatus(String(err instanceof Error ? err.message : err), "err");
  }
});

channelSelect.addEventListener("change", async () => {
  try {
    await refreshAll();
  } catch (err) {
    setStatus(String(err instanceof Error ? err.message : err), "err");
  }
});

addBtn.addEventListener("click", async () => {
  const channel = currentChannel();
  const accountId = currentAccountId();
  const contactId = contactIdInput.value.trim();
  if (!channel) {
    setStatus("Select a channel first", "warn");
    return;
  }
  if (!contactId) {
    setStatus("Contact ID is required", "warn");
    return;
  }
  if (contactId === "*") {
    setStatus("Wildcard entries are disabled. Add a specific contact.", "warn");
    return;
  }
  try {
    await apiRequest("/add", {
      method: "POST",
      body: { channel, accountId, id: contactId },
    });
    contactIdInput.value = "";
    setStatus("Added " + contactId, "ok");
    await refreshAll();
  } catch (err) {
    setStatus(String(err instanceof Error ? err.message : err), "err");
  }
});

bootstrap();
`;
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  paths: PairingContactUiPaths,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const subPath = pathname.slice(paths.apiRoot.length);
  const accountId = normalizeOptionalText(url.searchParams.get("accountId"));

  if (req.method === "GET" && subPath === "/channels") {
    const channels = listPairingChannels();
    sendJson(res, 200, { ok: true, channels });
    return;
  }

  if (req.method === "GET" && subPath === "/allow") {
    const channel = resolvePairingChannel(url.searchParams.get("channel"));
    const allowFrom = await readChannelAllowFromStore(channel, process.env, accountId);
    sendJson(res, 200, { ok: true, channel, accountId: accountId ?? null, allowFrom });
    return;
  }

  if (req.method === "POST" && subPath === "/add") {
    const body = await readJsonBody(req);
    const channel = resolvePairingChannel(body.channel);
    const id = requireTextField(body, "id");
    if (id === "*") {
      sendJson(res, 400, { ok: false, error: "Wildcard entries are disabled for manual-only mode" });
      return;
    }
    const bodyAccountId = normalizeOptionalText(body.accountId);
    const result = await addChannelAllowFromStoreEntry({
      channel,
      entry: id,
      accountId: bodyAccountId,
    });
    sendJson(res, 200, { ok: true, channel, accountId: bodyAccountId ?? null, ...result });
    return;
  }

  if (req.method === "POST" && subPath === "/remove") {
    const body = await readJsonBody(req);
    const channel = resolvePairingChannel(body.channel);
    const id = requireTextField(body, "id");
    const bodyAccountId = normalizeOptionalText(body.accountId);
    const result = await removeChannelAllowFromStoreEntry({
      channel,
      entry: id,
      accountId: bodyAccountId,
    });
    sendJson(res, 200, { ok: true, channel, accountId: bodyAccountId ?? null, ...result });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not Found" });
}

export async function handlePairingContactUiRequest(
  opts: PairingContactUiOptions,
): Promise<boolean> {
  const { req, res, pathname } = opts;
  const paths = resolvePaths(opts.basePath);

  const matchesPage = pathname === paths.pagePath || pathname === `${paths.pagePath}/`;
  const matchesApp = pathname === paths.appPath;
  const matchesApi = pathname === paths.apiRoot || pathname.startsWith(`${paths.apiRoot}/`);

  if (!matchesPage && !matchesApp && !matchesApi) {
    return false;
  }

  applySecurityHeaders(res);

  if (matchesPage || matchesApp) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed");
      return true;
    }
    if (matchesPage && req.method === "HEAD") {
      res.statusCode = 200;
      res.setHeader("Cache-Control", "no-cache");
      htmlContentType(res);
      res.end();
      return true;
    }
    if (matchesApp && req.method === "HEAD") {
      res.statusCode = 200;
      res.setHeader("Cache-Control", "no-cache");
      jsContentType(res);
      res.end();
      return true;
    }
    if (matchesPage) {
      res.statusCode = 200;
      res.setHeader("Cache-Control", "no-cache");
      htmlContentType(res);
      res.end(renderPairingContactHtml(paths));
      return true;
    }
    res.statusCode = 200;
    res.setHeader("Cache-Control", "no-cache");
    jsContentType(res);
    res.end(renderPairingContactScript());
    return true;
  }

  // API requires gateway auth token/password.
  const auth = await opts.authorizeApiRequest(req);
  if (!auth.ok) {
    opts.onApiAuthFailure(res, auth);
    return true;
  }

  try {
    await handleApiRequest(req, res, pathname, paths);
  } catch (err) {
    sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : "Request failed",
    });
  }
  return true;
}
