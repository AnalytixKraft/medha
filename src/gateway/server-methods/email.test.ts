import { describe, expect, it, vi } from "vitest";

const confirmSendMock = vi.fn();

vi.mock("../email/registry.js", () => ({
  getGatewayEmailService: async () => ({
    listAccounts: async () => [],
    removeAccount: async () => ({ removed: false }),
    startGoogleOAuth: async () => ({ authorizationUrl: "https://example.com", state: "s" }),
    startMicrosoftOAuth: async () => ({ authorizationUrl: "https://example.com", state: "s" }),
    connectImapSmtp: async () => ({ id: "acc-1" }),
    search: async () => [],
    get: async () => ({ meta: { id: "m1", from: "x", subject: "s", date: "d", snippet: "" }, bodyText: "", headersSubset: {} }),
    draftSend: async () => ({ draftId: "d1", confirmationCode: "123456", preview: { to: [], cc: [], bcc: [], subject: "", bodyText: "" }, expiresAt: new Date().toISOString() }),
    confirmSend: (...args: unknown[]) => confirmSendMock(...args),
    listPendingDrafts: async () => [],
  }),
}));

const { emailHandlers } = await import("./email.js");

describe("email handlers", () => {
  it("rejects email.send.confirm for non-Control UI clients", async () => {
    const respond = vi.fn();
    await emailHandlers["email.send.confirm"]({
      req: { id: "r1", type: "req", method: "email.send.confirm" },
      params: { draftId: "d1", confirmationCode: "123456" },
      client: {
        connect: {
          client: {
            id: "gateway-client",
            mode: "test",
            version: "test",
            platform: "test",
          },
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: expect.stringContaining("restricted") }),
    );
  });

  it("allows email.send.confirm for Control UI clients", async () => {
    confirmSendMock.mockResolvedValueOnce({ sent: true, providerMessageId: "mid-1" });
    const respond = vi.fn();

    await emailHandlers["email.send.confirm"]({
      req: { id: "r2", type: "req", method: "email.send.confirm" },
      params: { draftId: "d1", confirmationCode: "123456" },
      client: {
        connect: {
          client: {
            id: "medha-control-ui",
            mode: "ui",
            version: "test",
            platform: "test",
          },
        },
      },
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(confirmSendMock).toHaveBeenCalledWith({
      draftId: "d1",
      confirmationCode: "123456",
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ sent: true }),
      undefined,
    );
  });
});
