# UI Developer Notes

## Run the UI

- From repo root:
  - `pnpm ui:install`
  - `pnpm ui:dev`
  - `pnpm ui:build`
  - `pnpm --dir ui test`
- Dev URL:
  - `http://localhost:5173/`

## Key modules

- Entry:
  - `ui/src/main.ts`
  - `ui/src/ui/app.ts`
- Shell + page composition:
  - `ui/src/ui/app-render.ts`
  - `ui/src/ui/app-render.helpers.ts`
- Router/tab mapping:
  - `ui/src/ui/navigation.ts`
  - `ui/src/ui/app-settings.ts`
- Gateway WebSocket client:
  - `ui/src/ui/gateway.ts`
- Gateway auth/token:
  - `ui/src/ui/storage.ts` (shared token/password settings)
  - `ui/src/ui/device-auth.ts` (device token cache)
  - `ui/src/ui/device-identity.ts` (device keypair/signature)
- Feature RPC controllers:
  - `ui/src/ui/controllers/*.ts`
- View modules:
  - `ui/src/ui/views/*.ts`

## How to add a new page

1. Add tab id in `ui/src/ui/navigation.ts`:
   - extend `Tab` type
   - add path in `TAB_PATHS`
   - add icon mapping in `iconForTab`
   - place the tab in `TAB_GROUPS`
2. Create a renderer in `ui/src/ui/views/<page>.ts`.
3. Mount it in `ui/src/ui/app-render.ts` with the existing state/controller pattern.
4. If RPC is needed, add a controller in `ui/src/ui/controllers/<page>.ts`.
5. Add styles under `ui/src/styles/` (or `ui/src/styles/chat/` for chat-only).

## Notes on contracts

- UI talks to gateway only through WebSocket RPC/events in `gateway.ts`.
- Keep method names and payloads compatible with existing controllers.
- Avoid changing `src/gateway/*` contracts unless absolutely required.
