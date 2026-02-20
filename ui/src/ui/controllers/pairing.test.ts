import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPairing,
  rejectPairingCode,
  refreshPairing,
  type PairingState,
  type PairingStatusTone,
} from "./pairing.ts";
import type { UiSettings } from "../storage.ts";

const DEFAULT_SETTINGS: UiSettings = {
  gatewayUrl: "ws://127.0.0.1:18789",
  token: "test-token",
  sessionKey: "main",
  lastActiveSessionKey: "main",
  theme: "system",
  chatFocusMode: false,
  chatShowThinking: true,
  splitRatio: 0.6,
  navCollapsed: false,
  navGroupsCollapsed: {},
};

function createState(overrides: Partial<PairingState> = {}): PairingState {
  return {
    basePath: "",
    settings: DEFAULT_SETTINGS,
    pairingLoading: false,
    pairingBusy: false,
    pairingError: null,
    pairingStatus: null,
    pairingStatusTone: null as PairingStatusTone,
    pairingChannels: [],
    pairingChannel: "",
    pairingAccountId: "",
    pairingContactId: "",
    pairingPending: [],
    pairingAllowlist: [],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pairing controller", () => {
  it("loads allowlist entries on first load", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/pairing-contact/api/channels")) {
        return jsonResponse(200, { channels: ["whatsapp"] });
      }
      if (url.includes("/pairing-contact/api/pending?channel=whatsapp")) {
        return jsonResponse(200, { requests: [] });
      }
      if (url.includes("/pairing-contact/api/allow?channel=whatsapp")) {
        return jsonResponse(200, { allowFrom: ["+15551234567", "+15557654321"] });
      }
      return jsonResponse(404, { error: "not found" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = createState();

    await loadPairing(state);

    expect(state.pairingChannel).toBe("whatsapp");
    expect(state.pairingAllowlist).toEqual([
      { channel: "whatsapp", id: "+15551234567" },
      { channel: "whatsapp", id: "+15557654321" },
    ]);
    expect(state.pairingError).toBeNull();
  });

  it("keeps successful channel results when one channel fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/pairing-contact/api/pending?channel=whatsapp")) {
        return jsonResponse(200, { requests: [] });
      }
      if (url.includes("/pairing-contact/api/allow?channel=whatsapp")) {
        return jsonResponse(200, { allowFrom: ["+15550001111"] });
      }
      if (url.includes("/pairing-contact/api/pending?channel=telegram")) {
        return jsonResponse(500, { error: "telegram pending failed" });
      }
      if (url.includes("/pairing-contact/api/allow?channel=telegram")) {
        return jsonResponse(200, { allowFrom: [] });
      }
      return jsonResponse(404, { error: "not found" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = createState({
      pairingChannels: ["whatsapp", "telegram"],
      pairingChannel: "all",
    });

    await refreshPairing(state);

    expect(state.pairingAllowlist).toEqual([{ channel: "whatsapp", id: "+15550001111" }]);
    expect(state.pairingError).toContain("telegram");
  });

  it("rejects a pending code and refreshes", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/pairing-contact/api/reject")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { code?: string };
        expect(body.code).toBe("CODE1234");
        return jsonResponse(200, { changed: true });
      }
      if (url.includes("/pairing-contact/api/pending?channel=whatsapp")) {
        return jsonResponse(200, { requests: [] });
      }
      if (url.includes("/pairing-contact/api/allow?channel=whatsapp")) {
        return jsonResponse(200, { allowFrom: [] });
      }
      return jsonResponse(404, { error: "not found" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = createState({
      pairingChannel: "whatsapp",
      pairingChannels: ["whatsapp"],
      pairingPending: [
        { channel: "whatsapp", code: "CODE1234", id: "+15550001111", createdAt: "2026-01-01" },
      ],
    });

    await rejectPairingCode(state, "CODE1234", "whatsapp");

    expect(state.pairingStatus).toContain("Revoked pending code CODE1234");
    expect(state.pairingPending).toEqual([]);
    expect(state.pairingBusy).toBe(false);
  });
});
