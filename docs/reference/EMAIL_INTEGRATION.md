# Email Integration

Medha supports email with permission-based sign-in for major providers and IMAP/SMTP for everyone else.

## Provider Modes

- Google (Gmail): OAuth sign-in + Gmail API (`gmail.readonly`, `gmail.send`).
- Microsoft (Outlook/Office365): OAuth sign-in + Microsoft Graph (`Mail.Read`, `Mail.Send`).
- Other providers (Yahoo, iCloud, Zoho, Fastmail, custom domains): IMAP (read) + SMTP (send).
- Proton: use Proton Bridge local IMAP/SMTP.

## Why IMAP/SMTP Exists

Provider APIs are great for first-party ecosystems (Google/Microsoft), but IMAP/SMTP is the universal standard for providers without a stable mail API integration path.

## Security Model

- Least-privilege scopes for OAuth providers.
- Secrets are encrypted at rest.
- No token/password logging.
- HTML message bodies are sanitized to safe text (remote images/tracking pixels removed).
- Attachments are not supported in v1.
- Sending is always `draft -> preview -> confirm -> send` with expiring confirmation codes.

## UI Flow

Control UI path: `Settings -> Email`.

1. Connect account (`Google`, `Microsoft`, or `IMAP/SMTP`).
2. Load account messages (`search`, `open`).
3. Compose message and create draft preview.
4. Confirm draft with code to send.

## Local Smoke Script

Use `scripts/email-smoke.ts` for local end-to-end checks:

```bash
node --import tsx scripts/email-smoke.ts --to you@example.com --subject "Status" --body "Done."
```

Then confirm:

```bash
node --import tsx scripts/email-smoke.ts --to you@example.com --confirm-code 123456
```

## Revocation

- Remove account in Control UI to revoke Medha-side usage.
- Also revoke app access in provider security settings (Google/Microsoft) when needed.
