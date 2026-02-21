import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";

const execFile = promisify(execFileCb);
const KEYCHAIN_SERVICE = "medha-email-store";

async function readFromMacKeychain(account: string): Promise<string | null> {
  try {
    const { stdout } = await execFile("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
    ]);
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

async function writeToMacKeychain(account: string, secret: string): Promise<boolean> {
  try {
    await execFile("security", [
      "add-generic-password",
      "-U",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
      secret,
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function resolveEmailStorePassphrase(): Promise<string> {
  const fromEnv = process.env.MEDHA_EMAIL_STORE_PASSPHRASE?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  if (process.platform === "darwin") {
    const account = process.env.USER?.trim() || "default";
    const existing = await readFromMacKeychain(account);
    if (existing) {
      return existing;
    }

    const generated = randomBytes(32).toString("base64url");
    const stored = await writeToMacKeychain(account, generated);
    if (stored) {
      return generated;
    }
  }

  throw new Error(
    "Email secrets passphrase unavailable. Set MEDHA_EMAIL_STORE_PASSPHRASE or enable macOS Keychain access.",
  );
}
