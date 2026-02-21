import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GatewayEmailService } from "./service.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    await rm(dir, { recursive: true, force: true });
  }
  delete process.env.MEDHA_EMAIL_STORE_PASSPHRASE;
});

describe("GatewayEmailService", () => {
  it("enforces draft confirmation code", async () => {
    process.env.MEDHA_EMAIL_STORE_PASSPHRASE = "test-passphrase";
    const dir = await mkdtemp(path.join(os.tmpdir(), "medha-email-test-"));
    tempDirs.push(dir);

    const service = await GatewayEmailService.create({ stateDir: dir });
    const account = await service.connectImapSmtp({
      address: "user@example.com",
      allowPasswordAuth: true,
      preset: "custom",
      imap: {
        host: "imap.example.com",
        port: 993,
        secure: true,
        username: "user@example.com",
        password: "imap-password",
      },
      smtp: {
        host: "smtp.example.com",
        port: 465,
        secure: true,
        username: "user@example.com",
        password: "smtp-password",
      },
      testRead: false,
      testSend: false,
    });

    const draft = await service.draftSend({
      accountId: account.id,
      payload: {
        to: ["person@example.com"],
        subject: "Status",
        bodyText: "Done",
      },
    });

    await expect(
      service.confirmSend({
        draftId: draft.draftId,
        confirmationCode: "000000",
      }),
    ).rejects.toThrow("invalid confirmation code");
  });
});
