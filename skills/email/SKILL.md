---
name: email
description: Send outbound email with the `send_email` tool when users ask to email someone.
---

# Email Sending Skill

Use this skill when the user asks to send an email.

## Tool

- Use `send_email`.
- Required action for compose: `draft_send`.
- Required fields: `to`, `subject`, `bodyText`.
- Optional fields: `cc`, `bcc`.

## Behavior

- If the user already gave recipient, subject, and body, call `send_email` with `action: "draft_send"`.
- If one required field is missing, ask one short follow-up question for the missing field only.
- Keep the email body concise and faithful to user intent.
- Do not invent recipients or content.
- Tell the user to confirm the draft in Control UI to actually send.

## Example

User: `Send an email to person@example.com with subject Status and body Done.`

Tool call:

```json
{
  "action": "draft_send",
  "to": "person@example.com",
  "subject": "Status",
  "bodyText": "Done."
}
```
