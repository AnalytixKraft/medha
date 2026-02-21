import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const VERSION = 1;
const PBKDF2_ITERS = 210_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const IV_BYTES = 12;

type EncryptedEnvelope = {
  version: number;
  kdf: "pbkdf2-sha256";
  iterations: number;
  saltB64: string;
  ivB64: string;
  tagB64: string;
  cipherB64: string;
};

function deriveKey(passphrase: string, salt: Buffer, iterations: number): Buffer {
  return pbkdf2Sync(passphrase, salt, iterations, KEY_BYTES, "sha256");
}

function encode(value: Buffer): string {
  return value.toString("base64");
}

function decode(value: string, label: string): Buffer {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new Error(`invalid encrypted envelope field: ${label}`);
  }
}

export function encryptJsonString(plainJson: string, passphrase: string): string {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt, PBKDF2_ITERS);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainJson, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    version: VERSION,
    kdf: "pbkdf2-sha256",
    iterations: PBKDF2_ITERS,
    saltB64: encode(salt),
    ivB64: encode(iv),
    tagB64: encode(tag),
    cipherB64: encode(ciphertext),
  };

  return JSON.stringify(envelope);
}

export function decryptJsonString(encryptedJson: string, passphrase: string): string {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(encryptedJson) as EncryptedEnvelope;
  } catch {
    throw new Error("invalid encrypted envelope json");
  }

  if (
    envelope.version !== VERSION ||
    envelope.kdf !== "pbkdf2-sha256" ||
    !Number.isFinite(envelope.iterations)
  ) {
    throw new Error("unsupported encrypted envelope version or kdf");
  }

  const salt = decode(envelope.saltB64, "saltB64");
  const iv = decode(envelope.ivB64, "ivB64");
  const tag = decode(envelope.tagB64, "tagB64");
  const cipherBytes = decode(envelope.cipherB64, "cipherB64");

  const key = deriveKey(passphrase, salt, Math.floor(envelope.iterations));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  try {
    const plain = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    throw new Error("failed to decrypt encrypted envelope (wrong passphrase or corrupted file)");
  }
}

export class EncryptedJsonStore<T extends object> {
  constructor(
    private filePath: string,
    private passphrase: string,
  ) {}

  async load(fallback: T): Promise<T> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const decrypted = decryptJsonString(raw, this.passphrase);
      const parsed = JSON.parse(decrypted) as T;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return fallback;
      }
      return parsed;
    } catch {
      return fallback;
    }
  }

  async save(value: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const plainJson = JSON.stringify(value, null, 2);
    const encrypted = encryptJsonString(plainJson, this.passphrase);
    await writeFile(this.filePath, encrypted, "utf8");
  }
}
