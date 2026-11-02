# Fairplay

Wallet connected fixed odds sports market interface. The web app reads live odds from The Odds API, connects an EVM wallet on Base, and signs ERC-20 deposits, wagers, and withdrawals with that wallet. The separate STON.fi widget connects a TON wallet for TON mainnet swaps; TON swap assets do not become Base betting funds automatically.

## Current status

This repository contains a deployable contract and application code, but it is not a live wagering service. No contract is deployed or audited, the resolver and admin keys are not configured, and no bonus or payout bankroll is funded. Keep `BETTING_CONTRACT_ADDRESS` empty until a qualified security review and controlled deployment are complete. A locally successful build is not a security audit or production readiness certification.

The pool supports ERC-20 tokens and fixed odds. Deposits credit withdrawable cash and a 400% promotional balance, subject to an equally funded bonus reserve. Bonus balance is wager-only and cannot be withdrawn directly. Odds and market outcomes are set by the resolver; winners receive their gross payout in the site's withdrawable cash balance after settlement. Losing stakes accrue to the pool treasury, withdrawable by the admin. The contract cannot guarantee a market result or automatically settle it from the odds provider.

## Configure

Use a supported Node.js version (20.6 or newer) and copy `.env.example` to `.env`. Keep `.env` and all private keys out of source control.

Set `ODDS_API_KEY`, `ODDS_SPORTS`, `PUBLIC_URL` (HTTPS in production), an audited Base RPC endpoint, `RESOLVER_ADDRESS`, and the token list in `BETTING_TOKENS`. `BETTING_TOKENS` entries have the form `SYMBOL:ERC20_ADDRESS:DECIMALS`. Configure only tokens whose contracts and behavior have been reviewed. The sample USDC and WETH addresses are Base mainnet tokens.

Install dependencies with `npm ci`, create the browser bundle with `npm run build`, then run locally with `npm start`. Production hosting must provide HTTPS, secure environment secrets, monitoring, rate limits, and operational controls around the resolver. The included Node server is a minimal application server, not a hardened production hosting stack.

## Contract deployment and operations

Deployment sends a real transaction. First compile and review the contract, verify the chain and addresses, use a secured deployer account, and complete an independent audit. Then configure `DEPLOYER_PRIVATE_KEY` and `RESOLVER_ADDRESS` in a secure operator environment and run `npm run deploy:pool`. The command prints the deployment address; set that value as `BETTING_CONTRACT_ADDRESS` in the web server environment.

The deployer is the admin. The constructor enables only the first configured token. Admin operations can enable additional tokens and fund the bonus reserve. Resolver operations provision markets, publish results, and can be configured through the CLI. Example commands:

```sh
npm run operator -- enable-token 0xTOKEN true
npm run operator -- fund-bonus 0xTOKEN 1000
npm run operator -- set-odds "ODDS_API_EVENT_ID" 2.10,3.30 UNIX_CLOSE_TIME
npm run operator -- resolve "ODDS_API_EVENT_ID" 0
```

Outcome indexes for a market must match the UI's displayed order (team names, followed by Draw when provided). The CLI expects decimal odds and a future Unix close time; the market identifier is the keccak256 hash of the exact Odds API event ID. The close time is fixed when a market is first provisioned, and the contract rejects wagers at or after that time. Odds updates before close affect future wagers while existing wagers keep their signed odds. The event result must be checked against a trusted source before resolution. Users can settle resolved bets from My bets; settlement credits winning balances onchain.

Never put resolver or admin private keys in the web server environment. Use separate signer accounts and a secured operator machine. Ensure the pool holds enough tokens for user cash balances, maximum reserved payouts, bonus promotions, and operational margin. The contract rejects new wagers when it cannot reserve the full potential payout.

## STON.fi swaps

The swap widget uses TON Connect and STON.fi Omniston for executable quotes and wallet-signed TON mainnet swaps. Set the HTTPS `PUBLIC_URL` so the TON Connect manifest is valid. A successful TON swap is settled on TON; users must independently bridge or acquire an enabled Base token to wager. Quote availability, wallet support, network fees, and settlement are provided by external services and TON network validators.
