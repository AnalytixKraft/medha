import { html } from "lit";
import type {
  EmailAccountSummary,
  EmailDraftPreview,
  EmailMessage,
  EmailMessageMeta,
  EmailPendingDraft,
} from "../controllers/email.ts";

type ImapSmtpForm = {
  preset: string;
  address: string;
  displayName: string;
  allowPasswordAuth: boolean;
  protonBridgeHintAccepted: boolean;
  testRead: boolean;
  testSend: boolean;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  imapOauth2Token: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  smtpOauth2Token: string;
  smtpRejectUnauthorized: boolean;
};

export type EmailSettingsProps = {
  loading: boolean;
  busy: boolean;
  messageLoading: boolean;
  error: string | null;
  status: string | null;
  accounts: EmailAccountSummary[];
  selectedAccountId: string;
  query: string;
  messages: EmailMessageMeta[];
  selectedMessage: EmailMessage | null;
  pendingDraft: EmailDraftPreview | null;
  confirmCode: string;
  drafts: EmailPendingDraft[];
  googleClientId: string;
  googleClientSecret: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
  imapSmtpForm: ImapSmtpForm;
  onRefresh: () => void;
  onSelectAccount: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onOpenMessage: (messageId: string) => void;
  onGoogleClientIdChange: (value: string) => void;
  onGoogleClientSecretChange: (value: string) => void;
  onMicrosoftClientIdChange: (value: string) => void;
  onMicrosoftClientSecretChange: (value: string) => void;
  onConnectGoogle: () => void;
  onConnectMicrosoft: () => void;
  onImapSmtpFormChange: (patch: Partial<ImapSmtpForm>) => void;
  onConnectImapSmtp: () => void;
  onDraftCompose: () => void;
  onConfirmDraft: () => void;
  onConfirmCodeChange: (value: string) => void;
  composeTo: string;
  composeCc: string;
  composeBcc: string;
  composeSubject: string;
  composeBodyText: string;
  onComposeToChange: (value: string) => void;
  onComposeCcChange: (value: string) => void;
  onComposeBccChange: (value: string) => void;
  onComposeSubjectChange: (value: string) => void;
  onComposeBodyChange: (value: string) => void;
};

type Preset = {
  id: string;
  label: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  note?: string;
};

const PRESETS: Preset[] = [
  {
    id: "gmail",
    label: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    smtpSecure: true,
  },
  {
    id: "outlook",
    label: "Outlook / Office365",
    imapHost: "outlook.office365.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.office365.com",
    smtpPort: "587",
    smtpSecure: false,
  },
  {
    id: "yahoo",
    label: "Yahoo",
    imapHost: "imap.mail.yahoo.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: "465",
    smtpSecure: true,
  },
  {
    id: "icloud",
    label: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.mail.me.com",
    smtpPort: "587",
    smtpSecure: false,
  },
  {
    id: "zoho",
    label: "Zoho",
    imapHost: "imap.zoho.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.zoho.com",
    smtpPort: "465",
    smtpSecure: true,
  },
  {
    id: "fastmail",
    label: "Fastmail",
    imapHost: "imap.fastmail.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.fastmail.com",
    smtpPort: "465",
    smtpSecure: true,
  },
  {
    id: "proton-bridge",
    label: "Proton Bridge",
    imapHost: "127.0.0.1",
    imapPort: "1143",
    imapSecure: false,
    smtpHost: "127.0.0.1",
    smtpPort: "1025",
    smtpSecure: false,
    note: "Requires Proton Bridge running locally.",
  },
];

function providerLabel(provider: EmailAccountSummary["provider"]) {
  if (provider === "gmail") {
    return "Google";
  }
  if (provider === "microsoft") {
    return "Microsoft";
  }
  return "IMAP/SMTP";
}

function statusTone(status: EmailAccountSummary["status"]) {
  return status === "connected" ? "ok" : status === "expired" ? "warn" : "danger";
}

export function renderEmailSettings(props: EmailSettingsProps) {
  const selectedPreset = PRESETS.find((preset) => preset.id === props.imapSmtpForm.preset);

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      props.onImapSmtpFormChange({ preset: "custom" });
      return;
    }
    props.onImapSmtpFormChange({
      preset: preset.id,
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      imapSecure: preset.imapSecure,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
      smtpSecure: preset.smtpSecure,
    });
  };

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="row pairing-row-between">
          <div>
            <div class="card-title">Email Accounts</div>
            <div class="card-sub">Connect Gmail, Outlook/Microsoft, or IMAP/SMTP providers.</div>
          </div>
          <button class="btn" ?disabled=${props.loading || props.busy} @click=${props.onRefresh}>
            ${props.loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        ${
          props.error
            ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
            : null
        }
        ${
          props.status
            ? html`<div class="callout info" style="margin-top: 12px;">${props.status}</div>`
            : null
        }

        <div class="list pairing-list" style="margin-top: 12px;">
          ${
            props.accounts.length === 0
              ? html`<div class="muted pairing-empty">No email accounts connected yet.</div>`
              : props.accounts.map(
                  (account) => html`
                    <div class="list-item">
                      <div>
                        <div class="row" style="align-items: center; gap: 6px;">
                          <span class="mono">${providerLabel(account.provider)}</span>
                          <span class="statusDot ${statusTone(account.status)}"></span>
                          <strong>${account.address}</strong>
                        </div>
                        <div class="muted">${account.displayName ?? "No display name"}</div>
                      </div>
                      <div class="row" style="gap: 8px;">
                        <button
                          class="btn btn--sm"
                          ?disabled=${props.busy}
                          @click=${() => props.onSelectAccount(account.id)}
                        >
                          ${props.selectedAccountId === account.id ? "Selected" : "Select"}
                        </button>
                        <button
                          class="btn btn--sm"
                          ?disabled=${props.busy}
                          @click=${() => props.onRemoveAccount(account.id)}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  `,
                )
          }
        </div>
      </div>

      <div class="card">
        <div class="card-title">OAuth Sign-In</div>
        <div class="card-sub">Permission-based sign-in for Google and Microsoft.</div>

        <div class="form-grid" style="margin-top: 14px;">
          <label class="field full">
            <span>Google Client ID (optional if env configured)</span>
            <input
              .value=${props.googleClientId}
              @input=${(event: Event) =>
                props.onGoogleClientIdChange((event.target as HTMLInputElement).value)}
            />
          </label>

          <label class="field full">
            <span>Google Client Secret (optional if env configured)</span>
            <input
              type="password"
              .value=${props.googleClientSecret}
              autocomplete="new-password"
              @input=${(event: Event) =>
                props.onGoogleClientSecretChange((event.target as HTMLInputElement).value)}
            />
          </label>

          <div class="row" style="gap: 8px; flex-wrap: wrap;">
            <button class="btn primary" ?disabled=${props.busy} @click=${props.onConnectGoogle}>
              Sign in with Google
            </button>
          </div>

          <label class="field full" style="margin-top: 10px;">
            <span>Microsoft Client ID (optional if env configured)</span>
            <input
              .value=${props.microsoftClientId}
              @input=${(event: Event) =>
                props.onMicrosoftClientIdChange((event.target as HTMLInputElement).value)}
            />
          </label>

          <label class="field full">
            <span>Microsoft Client Secret (optional if env configured)</span>
            <input
              type="password"
              .value=${props.microsoftClientSecret}
              autocomplete="new-password"
              @input=${(event: Event) =>
                props.onMicrosoftClientSecretChange((event.target as HTMLInputElement).value)}
            />
          </label>

          <div class="row" style="gap: 8px; flex-wrap: wrap;">
            <button class="btn primary" ?disabled=${props.busy} @click=${props.onConnectMicrosoft}>
              Sign in with Microsoft
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-2" style="margin-top: 18px;">
      <div class="card">
        <div class="card-title">IMAP / SMTP Fallback</div>
        <div class="card-sub">
          Use for Yahoo/iCloud/Zoho/Fastmail/custom. OAuth2 tokens supported where provider allows XOAUTH2.
        </div>

        <div class="form-grid" style="margin-top: 14px;">
          <label class="field">
            <span>Provider Preset</span>
            <select
              .value=${props.imapSmtpForm.preset}
              @change=${(event: Event) =>
                applyPreset((event.target as HTMLSelectElement).value)}
            >
              <option value="custom">Custom</option>
              ${PRESETS.map((preset) => html`<option value=${preset.id}>${preset.label}</option>`)}
            </select>
          </label>

          <label class="field">
            <span>Email Address</span>
            <input
              .value=${props.imapSmtpForm.address}
              @input=${(event: Event) =>
                props.onImapSmtpFormChange({
                  address: (event.target as HTMLInputElement).value,
                })}
            />
          </label>

          <label class="field full">
            <span>Display Name</span>
            <input
              .value=${props.imapSmtpForm.displayName}
              @input=${(event: Event) =>
                props.onImapSmtpFormChange({
                  displayName: (event.target as HTMLInputElement).value,
                })}
            />
          </label>

          <label class="field full">
            <span>
              <input
                type="checkbox"
                .checked=${props.imapSmtpForm.allowPasswordAuth}
                @change=${(event: Event) =>
                  props.onImapSmtpFormChange({
                    allowPasswordAuth: (event.target as HTMLInputElement).checked,
                  })}
              />
              Explicitly allow app-password/password auth fallback
            </span>
          </label>

          ${
            selectedPreset?.id === "proton-bridge"
              ? html`
                  <label class="field full">
                    <span>
                      <input
                        type="checkbox"
                        .checked=${props.imapSmtpForm.protonBridgeHintAccepted}
                        @change=${(event: Event) =>
                          props.onImapSmtpFormChange({
                            protonBridgeHintAccepted: (event.target as HTMLInputElement).checked,
                          })}
                      />
                      Proton Bridge is running locally
                    </span>
                  </label>
                  <div class="callout info full">Proton requires Bridge local IMAP/SMTP proxy.</div>
                `
              : null
          }

          <div class="field full">
            <span>IMAP</span>
            <div class="form-grid" style="margin-top: 8px;">
              <label class="field">
                <span>Host</span>
                <input
                  .value=${props.imapSmtpForm.imapHost}
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      imapHost: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field">
                <span>Port</span>
                <input
                  .value=${props.imapSmtpForm.imapPort}
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      imapPort: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field full">
                <span>
                  <input
                    type="checkbox"
                    .checked=${props.imapSmtpForm.imapSecure}
                    @change=${(event: Event) =>
                      props.onImapSmtpFormChange({
                        imapSecure: (event.target as HTMLInputElement).checked,
                      })}
                  />
                  Secure TLS
                </span>
              </label>
              <label class="field">
                <span>Username</span>
                <input
                  .value=${props.imapSmtpForm.imapUsername}
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      imapUsername: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field">
                <span>Password / App Password</span>
                <input
                  type="password"
                  .value=${props.imapSmtpForm.imapPassword}
                  autocomplete="new-password"
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      imapPassword: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field full">
                <span>OAuth2 token (optional)</span>
                <input
                  .value=${props.imapSmtpForm.imapOauth2Token}
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      imapOauth2Token: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
            </div>
          </div>

          <div class="field full">
            <span>SMTP</span>
            <div class="form-grid" style="margin-top: 8px;">
              <label class="field">
                <span>Host</span>
                <input
                  .value=${props.imapSmtpForm.smtpHost}
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      smtpHost: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field">
                <span>Port</span>
                <input
                  .value=${props.imapSmtpForm.smtpPort}
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      smtpPort: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field full">
                <span>
                  <input
                    type="checkbox"
                    .checked=${props.imapSmtpForm.smtpSecure}
                    @change=${(event: Event) =>
                      props.onImapSmtpFormChange({
                        smtpSecure: (event.target as HTMLInputElement).checked,
                      })}
                  />
                  Secure TLS
                </span>
              </label>
              <label class="field">
                <span>Username</span>
                <input
                  .value=${props.imapSmtpForm.smtpUsername}
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      smtpUsername: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field">
                <span>Password / App Password</span>
                <input
                  type="password"
                  .value=${props.imapSmtpForm.smtpPassword}
                  autocomplete="new-password"
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      smtpPassword: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field full">
                <span>OAuth2 token (optional)</span>
                <input
                  .value=${props.imapSmtpForm.smtpOauth2Token}
                  @input=${(event: Event) =>
                    props.onImapSmtpFormChange({
                      smtpOauth2Token: (event.target as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="field full">
                <span>
                  <input
                    type="checkbox"
                    .checked=${props.imapSmtpForm.smtpRejectUnauthorized}
                    @change=${(event: Event) =>
                      props.onImapSmtpFormChange({
                        smtpRejectUnauthorized: (event.target as HTMLInputElement).checked,
                      })}
                  />
                  Verify SMTP TLS certificate
                </span>
              </label>
            </div>
          </div>

          <div class="field full">
            <span>
              <input
                type="checkbox"
                .checked=${props.imapSmtpForm.testRead}
                @change=${(event: Event) =>
                  props.onImapSmtpFormChange({
                    testRead: (event.target as HTMLInputElement).checked,
                  })}
              />
              Test read connection before save
            </span>
          </div>
          <div class="field full">
            <span>
              <input
                type="checkbox"
                .checked=${props.imapSmtpForm.testSend}
                @change=${(event: Event) =>
                  props.onImapSmtpFormChange({
                    testSend: (event.target as HTMLInputElement).checked,
                  })}
              />
              Test send connection before save
            </span>
          </div>

          <div class="row" style="margin-top: 4px; gap: 8px;">
            <button class="btn primary" ?disabled=${props.busy} @click=${props.onConnectImapSmtp}>
              Save IMAP/SMTP Account
            </button>
          </div>

          ${selectedPreset?.note ? html`<div class="callout info full">${selectedPreset.note}</div>` : null}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Inbox Preview</div>
        <div class="card-sub">Search and open sanitized message text from the selected account.</div>

        <div class="form-grid" style="margin-top: 14px;">
          <label class="field">
            <span>Selected Account</span>
            <select
              .value=${props.selectedAccountId}
              @change=${(event: Event) =>
                props.onSelectAccount((event.target as HTMLSelectElement).value)}
            >
              <option value="">Select account</option>
              ${props.accounts.map(
                (account) => html`
                  <option value=${account.id}>${providerLabel(account.provider)} · ${account.address}</option>
                `,
              )}
            </select>
          </label>

          <label class="field">
            <span>Search Query</span>
            <input
              .value=${props.query}
              placeholder="from:boss OR subject:status"
              @input=${(event: Event) => props.onQueryChange((event.target as HTMLInputElement).value)}
            />
          </label>

          <div class="row" style="gap: 8px;">
            <button class="btn" ?disabled=${props.messageLoading || !props.selectedAccountId} @click=${props.onSearch}>
              ${props.messageLoading ? "Loading..." : "Load messages"}
            </button>
          </div>

          <div class="list pairing-list full">
            ${
              props.messages.length === 0
                ? html`<div class="muted pairing-empty">No messages loaded.</div>`
                : props.messages.map(
                    (message) => html`
                      <button
                        class="list-item"
                        style="text-align: left; width: 100%;"
                        @click=${() => props.onOpenMessage(message.id)}
                      >
                        <div>
                          <div><strong>${message.subject}</strong></div>
                          <div class="muted">${message.from}</div>
                          <div class="muted">${message.snippet}</div>
                        </div>
                        <div class="muted">${new Date(message.date).toLocaleString()}</div>
                      </button>
                    `,
                  )
            }
          </div>

          ${
            props.selectedMessage
              ? html`
                  <div class="card" style="margin-top: 8px;">
                    <div class="card-title">Message</div>
                    <div class="card-sub">${props.selectedMessage.meta.subject}</div>
                    <pre
                      style="white-space: pre-wrap; margin-top: 10px; font-family: var(--font-mono); font-size: 13px;"
                    >${props.selectedMessage.bodyText}</pre>
                  </div>
                `
              : null
          }
        </div>
      </div>
    </section>

    <section class="grid grid-cols-2" style="margin-top: 18px;">
      <div class="card">
        <div class="card-title">Compose</div>
        <div class="card-sub">Draft first, then confirm to send.</div>

        <div class="form-grid" style="margin-top: 14px;">
          <label class="field full">
            <span>To</span>
            <input .value=${props.composeTo} @input=${(event: Event) => props.onComposeToChange((event.target as HTMLInputElement).value)} />
          </label>
          <label class="field full">
            <span>Cc</span>
            <input .value=${props.composeCc} @input=${(event: Event) => props.onComposeCcChange((event.target as HTMLInputElement).value)} />
          </label>
          <label class="field full">
            <span>Bcc</span>
            <input .value=${props.composeBcc} @input=${(event: Event) => props.onComposeBccChange((event.target as HTMLInputElement).value)} />
          </label>
          <label class="field full">
            <span>Subject</span>
            <input .value=${props.composeSubject} @input=${(event: Event) => props.onComposeSubjectChange((event.target as HTMLInputElement).value)} />
          </label>
          <label class="field full">
            <span>Body</span>
            <textarea
              rows="8"
              .value=${props.composeBodyText}
              @input=${(event: Event) => props.onComposeBodyChange((event.target as HTMLTextAreaElement).value)}
            ></textarea>
          </label>

          <div class="row" style="gap: 8px;">
            <button class="btn primary" ?disabled=${props.busy || !props.selectedAccountId} @click=${props.onDraftCompose}>
              Create Draft Preview
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Draft Confirmation</div>
        <div class="card-sub">Confirmation expires in 5 minutes.</div>

        ${
          props.pendingDraft
            ? html`
                <div class="callout info" style="margin-top: 12px;">
                  <div><strong>To:</strong> ${props.pendingDraft.preview.to.join(", ")}</div>
                  <div><strong>Cc:</strong> ${props.pendingDraft.preview.cc.join(", ") || "-"}</div>
                  <div><strong>Bcc:</strong> ${props.pendingDraft.preview.bcc.join(", ") || "-"}</div>
                  <div><strong>Subject:</strong> ${props.pendingDraft.preview.subject}</div>
                  <div><strong>Expires:</strong> ${new Date(props.pendingDraft.expiresAt).toLocaleString()}</div>
                  <pre style="white-space: pre-wrap; margin-top: 8px;">${props.pendingDraft.preview.bodyText}</pre>
                </div>

                <label class="field" style="margin-top: 12px;">
                  <span>Confirmation Code</span>
                  <input
                    .value=${props.confirmCode}
                    @input=${(event: Event) =>
                      props.onConfirmCodeChange((event.target as HTMLInputElement).value)}
                  />
                </label>

                <div class="row" style="margin-top: 12px; gap: 8px;">
                  <button class="btn primary" ?disabled=${props.busy} @click=${props.onConfirmDraft}>
                    Confirm and Send
                  </button>
                </div>
              `
            : html`<div class="muted" style="margin-top: 12px;">No draft pending confirmation.</div>`
        }

        <div class="card" style="margin-top: 16px;">
          <div class="card-title">Queued Drafts</div>
          <div class="card-sub">All unconfirmed drafts waiting for approval.</div>
          <div class="list pairing-list" style="margin-top: 10px;">
            ${
              props.drafts.length === 0
                ? html`<div class="muted pairing-empty">No pending drafts.</div>`
                : props.drafts.map(
                    (draft) => html`
                      <div class="list-item">
                        <div>
                          <div><strong>${draft.preview.subject}</strong></div>
                          <div class="muted">${draft.preview.to.join(", ")}</div>
                        </div>
                        <div class="muted">${new Date(draft.expiresAt).toLocaleTimeString()}</div>
                      </div>
                    `,
                  )
            }
          </div>
        </div>
      </div>
    </section>
  `;
}
