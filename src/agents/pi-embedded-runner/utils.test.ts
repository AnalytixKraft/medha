import { describe, expect, it } from "vitest";
import { mapThinkingLevel } from "./utils.js";

describe("mapThinkingLevel", () => {
  it("defaults to off when unset", () => {
    expect(mapThinkingLevel({})).toBe("off");
  });

  it("maps minimal to low for openai gpt-5 models", () => {
    expect(
      mapThinkingLevel({
        level: "minimal",
        provider: "openai",
        modelId: "gpt-5.1",
      }),
    ).toBe("low");
  });

  it("keeps minimal for non-openai providers", () => {
    expect(
      mapThinkingLevel({
        level: "minimal",
        provider: "anthropic",
        modelId: "claude-sonnet-4",
      }),
    ).toBe("minimal");
  });
});
