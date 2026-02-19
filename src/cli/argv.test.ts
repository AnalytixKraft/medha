import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "medha", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "medha", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "medha", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "medha", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "medha", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "medha", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "medha", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "medha"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "medha", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "medha", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "medha", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "medha", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "medha", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "medha", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "medha", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "medha", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "medha", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "medha", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "medha", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "medha", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "medha", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "medha", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["node", "medha", "status"],
    });
    expect(nodeArgv).toEqual(["node", "medha", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["node-22", "medha", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "medha", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["node-22.2.0.exe", "medha", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "medha", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["node-22.2", "medha", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "medha", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["node-22.2.exe", "medha", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "medha", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["/usr/bin/node-22.2.0", "medha", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "medha", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["nodejs", "medha", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "medha", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["node-dev", "medha", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "medha", "node-dev", "medha", "status"]);

    const directArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["medha", "status"],
    });
    expect(directArgv).toEqual(["node", "medha", "status"]);

    const bunArgv = buildParseArgv({
      programName: "medha",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "medha",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "medha", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "medha", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "config", "get", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "config", "unset", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "models", "list"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "models", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "medha", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "medha", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["config", "get"])).toBe(false);
    expect(shouldMigrateStateFromPath(["models", "status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
