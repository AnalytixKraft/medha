import { normalizeBasePath } from "../navigation.ts";
import type { UiSettings } from "../storage.ts";

export type PairingStatusTone = "success" | "info" | "danger" | null;

export type PairingPendingEntry = {
  channel: string;
  code: string;
  id: string;
  createdAt?: string;
};

export type PairingAllowEntry = {
  channel: string;
  id: string;
};

export type PairingState = {
  basePath: string;
  settings: UiSettings;
  pairingLoading: boolean;
  pairingBusy: boolean;
  pairingError: string | null;
  pairingStatus: string | null;
  pairingStatusTone: PairingStatusTone;
  pairingChannels: string[];
  pairingChannel: string;
  pairingAccountId: string;
  pairingContactId: string;
  pairingPending: PairingPendingEntry[];
  pairingAllowlist: PairingAllowEntry[];
};

type PairingApiOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
};

type PairingChannelsResponse = {
  channels?: unknown;
};

type PairingPendingResponse = {
  requests?: unknown;
};

type PairingAllowResponse = {
  allowFrom?: unknown;
};

type PairingMutationResponse = {
  changed?: unknown;
};

function resolvePairingApiRoot(basePath: string): string {
  const normalizedBase = normalizeBasePath(basePath ?? "");
  return normalizedBase ? `${normalizedBase}/pairing-contact/api` : "/pairing-contact/api";
}

function normalizeChannelList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.length > 0);
}

function normalizePendingList(channel: string, value: unknown): PairingPendingEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const code = typeof row.code === "string" ? row.code.trim() : "";
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!code || !id) {
        return null;
      }
      const createdAt = typeof row.createdAt === "string" ? row.createdAt.trim() : undefined;
      return {
        channel,
        code,
        id,
        createdAt: createdAt && createdAt.length > 0 ? createdAt : undefined,
      } satisfies PairingPendingEntry;
    })
    .filter((entry): entry is PairingPendingEntry => Boolean(entry));
}

function normalizeAllowlist(channel: string, value: unknown): PairingAllowEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0)
    .map((id) => ({ channel, id }) satisfies PairingAllowEntry);
}

function setPairingStatus(state: PairingState, message: string | null, tone: PairingStatusTone) {
  state.pairingStatus = message;
  state.pairingStatusTone = tone;
}

function currentAccountId(state: PairingState): string | undefined {
  const trimmed = state.pairingAccountId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveSelectedChannels(state: PairingState): string[] {
  const selected = state.pairingChannel.trim();
  if (!selected) {
    return [];
  }
  if (selected === "all") {
    return [...state.pairingChannels];
  }
  return [selected];
}

function resolveActionChannel(state: PairingState, channelOverride?: string): string | null {
  const direct = channelOverride?.trim();
  if (direct) {
    return direct;
  }
  const selected = state.pairingChannel.trim();
  if (!selected || selected === "all") {
    return null;
  }
  return selected;
}

async function pairingApiRequest<T>(
  state: PairingState,
  path: string,
  options?: PairingApiOptions,
): Promise<T> {
  const root = resolvePairingApiRoot(state.basePath);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  const token = state.settings.token.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${root}${path}`, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (!response.ok) {
    const detail = typeof payload.error === "string" && payload.error.trim() ? payload.error : null;
    if (response.status === 401 && !token) {
      throw new Error("Gateway token missing. Add it in Overview first, then refresh.");
    }
    throw new Error(detail ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function loadPairing(state: PairingState) {
  if (state.pairingLoading) {
    return;
  }
  state.pairingLoading = true;
  state.pairingError = null;
  try {
    const response = await pairingApiRequest<PairingChannelsResponse>(state, "/channels");
    const channels = normalizeChannelList(response.channels);
    state.pairingChannels = channels;
    const selected = state.pairingChannel.trim();
    if (channels.length === 0) {
      state.pairingChannel = "";
      state.pairingPending = [];
      state.pairingAllowlist = [];
      setPairingStatus(state, "No pairing channels are available.", "info");
      return;
    }
    if (selected === "all") {
      // Keep explicit all-channel mode.
    } else if (!selected || !channels.includes(selected)) {
      state.pairingChannel = channels.length > 1 ? "all" : channels[0];
    }
    await refreshPairing(state);
  } catch (err) {
    state.pairingError = String(err);
    setPairingStatus(state, "Pairing data could not be loaded.", "danger");
  } finally {
    state.pairingLoading = false;
  }
}

export async function refreshPairing(state: PairingState) {
  if (state.pairingBusy) {
    return;
  }
  state.pairingLoading = true;
  state.pairingError = null;
  try {
    const accountId = currentAccountId(state);
    const channels = resolveSelectedChannels(state);
    if (channels.length === 0) {
      state.pairingPending = [];
      state.pairingAllowlist = [];
      return;
    }
    const settled = await Promise.allSettled(
      channels.map(async (channel) => {
        const query = new URLSearchParams({ channel });
        if (accountId) {
          query.set("accountId", accountId);
        }
        const [pendingRes, allowRes] = await Promise.all([
          pairingApiRequest<PairingPendingResponse>(state, `/pending?${query.toString()}`),
          pairingApiRequest<PairingAllowResponse>(state, `/allow?${query.toString()}`),
        ]);
        return {
          channel,
          pending: normalizePendingList(channel, pendingRes.requests),
          allow: normalizeAllowlist(channel, allowRes.allowFrom),
        };
      }),
    );
    const failures: string[] = [];
    const results: Array<{
      channel: string;
      pending: PairingPendingEntry[];
      allow: PairingAllowEntry[];
    }> = [];
    for (let i = 0; i < settled.length; i += 1) {
      const item = settled[i];
      const channel = channels[i] ?? "unknown";
      if (!item) {
        continue;
      }
      if (item.status === "fulfilled") {
        results.push(item.value);
        continue;
      }
      failures.push(`${channel}: ${String(item.reason)}`);
    }
    if (results.length === 0 && failures.length > 0) {
      throw new Error(failures[0]);
    }
    const pending = results
      .flatMap((entry) => entry.pending)
      .toSorted((a, b) => {
        const aTs = Date.parse(a.createdAt ?? "");
        const bTs = Date.parse(b.createdAt ?? "");
        if (Number.isFinite(aTs) && Number.isFinite(bTs)) {
          return bTs - aTs;
        }
        return a.code.localeCompare(b.code);
      });
    const allowDeduped = new Map<string, PairingAllowEntry>();
    for (const row of results.flatMap((entry) => entry.allow)) {
      allowDeduped.set(`${row.channel}:${row.id}`, row);
    }
    const allowlist = Array.from(allowDeduped.values()).toSorted((a, b) => {
      const byChannel = a.channel.localeCompare(b.channel);
      if (byChannel !== 0) {
        return byChannel;
      }
      return a.id.localeCompare(b.id);
    });
    state.pairingPending = pending;
    state.pairingAllowlist = allowlist;
    if (failures.length > 0) {
      state.pairingError = `Some channels failed to load: ${failures.join(" | ")}`;
    }
  } catch (err) {
    state.pairingError = String(err);
  } finally {
    state.pairingLoading = false;
  }
}

export async function approvePairingCode(
  state: PairingState,
  code: string,
  channelOverride?: string,
) {
  if (state.pairingBusy) {
    return;
  }
  const channel = resolveActionChannel(state, channelOverride);
  if (!channel) {
    setPairingStatus(state, "Select a specific channel before approving.", "info");
    return;
  }
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    setPairingStatus(state, "Pairing code is required.", "info");
    return;
  }
  state.pairingBusy = true;
  let shouldRefresh = false;
  try {
    const accountId = currentAccountId(state);
    await pairingApiRequest(state, "/approve", {
      method: "POST",
      body: {
        channel,
        ...(accountId ? { accountId } : {}),
        code: normalizedCode,
      },
    });
    setPairingStatus(state, `Approved ${normalizedCode} on ${channel}.`, "success");
    shouldRefresh = true;
  } catch (err) {
    state.pairingError = String(err);
    setPairingStatus(state, `Approve failed: ${String(err)}`, "danger");
  } finally {
    state.pairingBusy = false;
  }
  if (shouldRefresh) {
    await refreshPairing(state);
  }
}

export async function rejectPairingCode(
  state: PairingState,
  code: string,
  channelOverride?: string,
) {
  if (state.pairingBusy) {
    return;
  }
  const channel = resolveActionChannel(state, channelOverride);
  if (!channel) {
    setPairingStatus(state, "Select a specific channel before revoking.", "info");
    return;
  }
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    setPairingStatus(state, "Pairing code is required.", "info");
    return;
  }
  state.pairingBusy = true;
  let shouldRefresh = false;
  try {
    const accountId = currentAccountId(state);
    const result = await pairingApiRequest<PairingMutationResponse>(state, "/reject", {
      method: "POST",
      body: {
        channel,
        ...(accountId ? { accountId } : {}),
        code: normalizedCode,
      },
    });
    const changed = result.changed === true;
    setPairingStatus(
      state,
      changed
        ? `Revoked pending code ${normalizedCode} on ${channel}.`
        : `${normalizedCode} was not pending.`,
      changed ? "success" : "info",
    );
    shouldRefresh = true;
  } catch (err) {
    state.pairingError = String(err);
    setPairingStatus(state, `Revoke failed: ${String(err)}`, "danger");
  } finally {
    state.pairingBusy = false;
  }
  if (shouldRefresh) {
    await refreshPairing(state);
  }
}

export async function addPairingContact(state: PairingState, contactId: string) {
  if (state.pairingBusy) {
    return;
  }
  const channel = resolveActionChannel(state);
  if (!channel) {
    setPairingStatus(state, "Select a specific channel before adding a contact.", "info");
    return;
  }
  const normalizedId = contactId.trim();
  if (!normalizedId) {
    setPairingStatus(state, "Contact ID / phone is required.", "info");
    return;
  }
  state.pairingBusy = true;
  let shouldRefresh = false;
  try {
    const accountId = currentAccountId(state);
    const result = await pairingApiRequest<PairingMutationResponse>(state, "/add", {
      method: "POST",
      body: {
        channel,
        ...(accountId ? { accountId } : {}),
        id: normalizedId,
      },
    });
    state.pairingContactId = "";
    const changed = result.changed === true;
    setPairingStatus(
      state,
      changed ? `Added ${normalizedId} on ${channel}.` : `${normalizedId} is already paired.`,
      changed ? "success" : "info",
    );
    shouldRefresh = true;
  } catch (err) {
    state.pairingError = String(err);
    setPairingStatus(state, `Add failed: ${String(err)}`, "danger");
  } finally {
    state.pairingBusy = false;
  }
  if (shouldRefresh) {
    await refreshPairing(state);
  }
}

export async function revokePairingContact(
  state: PairingState,
  contactId: string,
  channelOverride?: string,
) {
  if (state.pairingBusy) {
    return;
  }
  const channel = resolveActionChannel(state, channelOverride);
  if (!channel) {
    setPairingStatus(state, "Select a specific channel before revoking.", "info");
    return;
  }
  const normalizedId = contactId.trim();
  if (!normalizedId) {
    setPairingStatus(state, "Contact ID / phone is required.", "info");
    return;
  }
  state.pairingBusy = true;
  let shouldRefresh = false;
  try {
    const accountId = currentAccountId(state);
    const result = await pairingApiRequest<PairingMutationResponse>(state, "/remove", {
      method: "POST",
      body: {
        channel,
        ...(accountId ? { accountId } : {}),
        id: normalizedId,
      },
    });
    const changed = result.changed === true;
    setPairingStatus(
      state,
      changed ? `Revoked ${normalizedId} on ${channel}.` : `${normalizedId} was not paired.`,
      changed ? "success" : "info",
    );
    shouldRefresh = true;
  } catch (err) {
    state.pairingError = String(err);
    setPairingStatus(state, `Revoke failed: ${String(err)}`, "danger");
  } finally {
    state.pairingBusy = false;
  }
  if (shouldRefresh) {
    await refreshPairing(state);
  }
}
