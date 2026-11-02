# All-in-One TON Betting

TON Connect based sports wagering application shell with a React frontend, Express API, Prisma persistence, and free public odds source adapters. Users keep their TON wallet keys and approve transactions in Tonkeeper, MyTonWallet, or another TON Connect wallet. The server does not create user wallets or keep user private keys.

## Deployment status

This repository is not currently a production wagering deployment. The application gates wagering off until an escrow contract is deployed, the reserve check succeeds on TON mainnet, and fresh bookmaker odds are available. No contract address or funded reserve is configured in this checkout. A production launch also needs a reviewed and audited escrow contract, jurisdiction-specific gambling authorization, a real KYC/AML provider, and operational monitoring. Do not accept real stakes until those pieces are completed and independently verified.

The current frontend and API implement wallet connection, odds display, market and bet workflows, responsible-gambling fields, and reserve gating. The on-chain contract and its matching generated client/deployment scripts still need to be finalized and independently tested before the app can truthfully be called ready for wagering. Backend transaction verification must also be hardened for reliable indexed/finalized transaction lookup before production.

## Odds feed

No Odds API key is required or supported. The backend polls the public DraftKings, FanDuel, Action Network scoreboard, and ESPN endpoints every 30 seconds, normalizes available prices, and stores the last known games in Prisma. ESPN contributes schedules and scores, not sportsbook prices. Public sportsbook endpoints are undocumented and may break, geoblock, or rate-limit; fresh odds availability is not guaranteed. No prices are fabricated when sources fail.

The admin settings page at `/settings` displays odds source status. Admin-only source configuration and audit endpoints require `ADMIN_API_TOKEN`.

## Local development

Requirements: Node.js 20.19+ and npm.

```sh
cp backend/.env.example backend/.env
npm install
npm run db:generate
npm run db:push
npm run dev
```

The frontend runs at `http://localhost:5173`; the API runs at `http://localhost:3001`. Before running the backend, set a long random `ADMIN_API_TOKEN`, and provide a public HTTPS `PUBLIC_URL` before publishing the TON Connect manifest. SQLite is intended for local development. Never commit `backend/.env`.

## Docker deployment

Set `POSTGRES_PASSWORD`, `FRONTEND_ORIGIN`, `PUBLIC_URL`, and `ADMIN_API_TOKEN` as deployment secrets/environment variables. Build and start with:

```sh
docker compose up --build -d
```

The frontend is exposed on port 8080 by default and proxies API calls to the backend. PostgreSQL is used by Compose. Set the contract and TON mainnet settings only after the contract has been deployed and reviewed. The health endpoint is `/health`.

## Wagering gate and status

The gate requires a configured `ESCROW_CONTRACT_ADDRESS`, successful on-chain reserve/liability checks with at least `MIN_RESERVE_TON` in excess reserves on mainnet, and a fresh odds feed. Check status with:

```sh
npm run check:reserve
```

This command reports the current gate state and exits nonzero while wagering is unavailable. Setting an environment variable alone is not enough to enable safe wagering; the escrow code, expected getters, wallet transaction layouts, reserve policies, and settlement verification must match and be audited.

## Responsible gambling and legal use

The interface includes age confirmation, KYC status gates, self-exclusion fields, and stake limits. These do not replace a licensed KYC/AML provider or jurisdiction controls. Do not enable betting until those integrations and operator procedures are in place.

> Requires gambling license in your jurisdiction. Real money wagering must comply with local laws. KYC/AML required.
