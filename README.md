# ARCHEI Companion Monorepo

Blueprint generato il 2025-10-15 08:12. Pronto all'uso con **pnpm**, **Node 20.18.0**, **Next.js 14**, **WS server su Railway** e **web su Vercel**.

## Requisiti
- Node 20.18.0 (`.nvmrc` incluso)
- pnpm 10.18.3 (usa `corepack`)

## Setup rapido
```bash
corepack prepare pnpm@10.18.3 --activate
pnpm -w install
pnpm dev:ws      # avvia WS su :8787
pnpm dev:web     # avvia Next.js su :3000
```

## Env
- Web: `NEXT_PUBLIC_WS_DEFAULT` (vedi `apps/web/.env.local.example`)
- Railway userà `PORT` automaticamente per il WS.

## Deploy
- **Railway**: punta `apps/realtime-server`.
- **Vercel**: punta `apps/web`, setta `NEXT_PUBLIC_WS_DEFAULT` all'URL wss di Railway.

## Struttura
- `apps/web` — Next.js App Router + Tailwind
- `apps/realtime-server` — WS server (ws://, wss://)
- `packages/shared` — util e tipi condivisi (dice, broadcast, realtime)

## 2) Avvia il WebSocket server (Terminale A)
## pnpm dev:ws

##3) Avvia il Next.js web (Terminale B)
## pnpm dev:web