import { html } from "lit";
import type {
  PairingAllowEntry,
  PairingStatusTone,
} from "../controllers/pairing.ts";

export type PairingProps = {
  loading: boolean;
  busy: boolean;
  channels: string[];
  channel: string;
  accountId: string;
  contactId: string;
  allowlist: PairingAllowEntry[];
  error: string | null;
  status: string | null;
  statusTone: PairingStatusTone;
  onRefresh: () => void;
  onChannelChange: (next: string) => void;
  onAccountIdChange: (next: string) => void;
  onContactIdChange: (next: string) => void;
  onAddContact: () => void;
  onRevoke: (id: string, channel: string) => void;
};

function resolveStatusClass(tone: PairingStatusTone): string {
  if (tone === "success") {
    return "success";
  }
  if (tone === "danger") {
    return "danger";
  }
  return "info";
}

export function renderPairing(props: PairingProps) {
  const hasChannels = props.channels.length > 0;
  const canAddContact = hasChannels && props.channel !== "all" && !props.busy;
  const selectionLabel =
    props.channel === "all"
      ? "All channels"
      : props.channel
        ? props.channel
        : "No channel selected";

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="row pairing-row-between">
          <div>
            <div class="card-title">Pairing Control</div>
            <div class="card-sub">
              Manage paired contacts directly from Settings using the same gateway auth.
            </div>
          </div>
          <button class="btn" ?disabled=${props.loading || props.busy} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <div class="form-grid" style="margin-top: 14px;">
          <label class="field">
            <span>Channel</span>
            <select
              .value=${props.channel}
              ?disabled=${props.loading || props.busy || !hasChannels}
              @change=${(event: Event) =>
                props.onChannelChange((event.target as HTMLSelectElement).value)}
            >
              ${
                hasChannels
                  ? html`
                    ${
                      props.channels.length > 1
                        ? html`
                            <option value="all">All channels</option>
                          `
                        : null
                    }
                    ${props.channels.map((channel) => html`<option value=${channel}>${channel}</option>`)}
                  `
                  : html`
                      <option value="">No pairing channels found</option>
                    `
              }
            </select>
          </label>

          <label class="field">
            <span>Account ID (optional)</span>
            <input
              .value=${props.accountId}
              ?disabled=${props.loading || props.busy}
              placeholder="default"
              @input=${(event: Event) =>
                props.onAccountIdChange((event.target as HTMLInputElement).value)}
            />
          </label>
        </div>

        <div class="muted pairing-meta">Scope: ${selectionLabel}</div>
        ${
          props.error
            ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
            : null
        }
        ${
          props.status
            ? html`<div class="callout ${resolveStatusClass(props.statusTone)}" style="margin-top: 12px;">
              ${props.status}
            </div>`
            : null
        }
      </div>

      <div class="card">
        <div class="card-title">Manual Add Contact</div>
        <div class="card-sub">
          Add a phone or contact ID manually. Unknown senders stay blocked until added here.
        </div>
        <div class="form-grid" style="margin-top: 14px;">
          <label class="field full">
            <span>Contact ID / Phone</span>
            <input
              .value=${props.contactId}
              ?disabled=${!canAddContact}
              placeholder="+15551234567"
              @input=${(event: Event) =>
                props.onContactIdChange((event.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <div class="row" style="margin-top: 12px;">
          <button class="btn primary" ?disabled=${!canAddContact} @click=${props.onAddContact}>
            Add Contact
          </button>
          ${
            props.channel === "all"
              ? html`
                  <span class="muted">Select a specific channel to add a contact.</span>
                `
              : null
          }
        </div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="row pairing-row-between">
        <div>
          <div class="card-title">Paired Contacts</div>
          <div class="card-sub">All currently allowed contacts. Revoke access anytime.</div>
        </div>
        <span class="pill">${props.allowlist.length}</span>
      </div>

      <div class="list pairing-list">
        ${
          props.allowlist.length === 0
            ? html`
                <div class="muted pairing-empty">No paired contacts yet.</div>
              `
            : props.allowlist.map(
                (entry) => html`
                  <div class="list-item">
                    <div class="list-main">
                      <div class="list-title">${entry.id}</div>
                      <div class="list-sub">Channel: <span class="mono">${entry.channel}</span></div>
                    </div>
                    <div class="list-meta">
                      <div class="row pairing-row-end">
                        <button
                          class="btn btn--sm danger"
                          ?disabled=${props.busy}
                          @click=${() => props.onRevoke(entry.id, entry.channel)}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  </div>
                `,
              )
        }
      </div>
    </section>
  `;
}
