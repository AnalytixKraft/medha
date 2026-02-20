import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addPairingContact,
  loadPairing,
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
      if (url.includes("/pairing-contact/api/allow?channel=whatsapp")) {
        return jsonResponse(200, { allowFrom: ["+15550001111"] });
      }
      if (url.includes("/pairing-contact/api/allow?channel=telegram")) {
        return jsonResponse(500, { error: "telegram allowlist failed" });
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

  it("blocks wildcard allowlist entries in manual-only mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const state = createState({
      pairingChannel: "whatsapp",
      pairingChannels: ["whatsapp"],
    });

    await addPairingContact(state, "*");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.pairingStatus).toContain("Wildcard entries are disabled");
  });
});
