import { describe, expect, it, vi } from "vitest";

const callGatewayToolMock = vi.fn();

vi.mock("./gateway.js", () => ({
  callGatewayTool: (...args: unknown[]) => callGatewayToolMock(...args),
  readGatewayCallOptions: () => ({ gatewayUrl: undefined, gatewayToken: undefined, timeoutMs: undefined }),
}));

const { createEmailTool } = await import("./email-tool.js");

describe("email tool", () => {
  it("defaults to accounts_list when no action is provided", async () => {
    callGatewayToolMock.mockResolvedValueOnce({ accounts: [] });
    const tool = createEmailTool();
    const result = await tool.execute?.("t-1", {});

    expect(callGatewayToolMock).toHaveBeenCalledWith("email.accounts.list", expect.any(Object), {});
    expect((result as { details?: { ok?: boolean } }).details?.ok).toBe(true);
  });

  it("uses legacy to/subject/body input as draft_send", async () => {
    callGatewayToolMock.mockResolvedValueOnce({ draftId: "d1" });
    const tool = createEmailTool();
    await tool.execute?.("t-2", {
      accountId: "acc-1",
      to: "person@example.com",
      subject: "Status",
      body: "Done",
    });

    expect(callGatewayToolMock).toHaveBeenCalledWith(
      "email.send.draft",
      expect.any(Object),
      expect.objectContaining({
        accountId: "acc-1",
        to: ["person@example.com"],
        subject: "Status",
        bodyText: "Done",
      }),
    );
  });

  it("supports search action", async () => {
    callGatewayToolMock.mockResolvedValueOnce({ messages: [] });
    const tool = createEmailTool();
    await tool.execute?.("t-3", {
      action: "search",
      accountId: "acc-2",
      query: "from:boss",
      limit: 5,
    });

    expect(callGatewayToolMock).toHaveBeenCalledWith(
      "email.messages.search",
      expect.any(Object),
      expect.objectContaining({ accountId: "acc-2", query: "from:boss", limit: 5 }),
    );
  });
});
