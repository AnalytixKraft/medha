import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "medha",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "medha", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "medha", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "medha", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "medha", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "medha", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "medha", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "medha", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "medha", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".medha-dev");
    expect(env.MEDHA_PROFILE).toBe("dev");
    expect(env.MEDHA_STATE_DIR).toBe(expectedStateDir);
    expect(env.MEDHA_CONFIG_PATH).toBe(path.join(expectedStateDir, "medha.json"));
    expect(env.MEDHA_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      MEDHA_STATE_DIR: "/custom",
      MEDHA_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.MEDHA_STATE_DIR).toBe("/custom");
    expect(env.MEDHA_GATEWAY_PORT).toBe("19099");
    expect(env.MEDHA_CONFIG_PATH).toBe(path.join("/custom", "medha.json"));
  });

  it("uses MEDHA_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      MEDHA_HOME: "/srv/medha-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/medha-home");
    expect(env.MEDHA_STATE_DIR).toBe(path.join(resolvedHome, ".medha-work"));
    expect(env.MEDHA_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".medha-work", "medha.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("medha doctor --fix", {})).toBe("medha doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("medha doctor --fix", { MEDHA_PROFILE: "default" })).toBe(
      "medha doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("medha doctor --fix", { MEDHA_PROFILE: "Default" })).toBe(
      "medha doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("medha doctor --fix", { MEDHA_PROFILE: "bad profile" })).toBe(
      "medha doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("medha --profile work doctor --fix", { MEDHA_PROFILE: "work" }),
    ).toBe("medha --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("medha --dev doctor", { MEDHA_PROFILE: "dev" })).toBe(
      "medha --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("medha doctor --fix", { MEDHA_PROFILE: "work" })).toBe(
      "medha --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("medha doctor --fix", { MEDHA_PROFILE: "  jbmedha  " })).toBe(
      "medha --profile jbmedha doctor --fix",
    );
  });

  it("handles command with no args after medha", () => {
    expect(formatCliCommand("medha", { MEDHA_PROFILE: "test" })).toBe(
      "medha --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm medha doctor", { MEDHA_PROFILE: "work" })).toBe(
      "pnpm medha --profile work doctor",
    );
  });
});
