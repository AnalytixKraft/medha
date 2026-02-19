# Medha

Medha is a trimmed personal fork of Medha focused on:

- WhatsApp channel
- OpenAI model provider
- Local gateway runtime

## Requirements

- macOS or Linux
- Node.js 22+
- Linked WhatsApp session in `~/.medha/credentials`
- OpenAI API key configured in Medha auth

## Start

```bash
npm run gateway:run
```

Or directly:

```bash
node medha.mjs gateway run --bind loopback --port 18789 --force
```

## Status

```bash
npm run gateway:status
```

## Stop

```bash
npm run gateway:stop
```

## Dashboard

Open:

- `http://127.0.0.1:18789/`

## Notes

- This repo was intentionally trimmed for personal use.
- Many upstream docs/apps/tests/platform integrations were removed.
- Core runtime remains in `dist/` with launcher `medha.mjs`.
