import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#medha",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#medha",
      rawTarget: "#medha",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "medha-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "medha-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "medha-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "medha-bot",
      rawTarget: "medha-bot",
    });
  });
});
