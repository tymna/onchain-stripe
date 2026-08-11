# SubscriptionManager — Stripe, on-chain

Recurring USDC subscriptions on **Base**. A payment **router + bookkeeper, never a vault** — every token that comes in the same tx goes straight back out. Nothing is held.

## 3 actors

| Stripe | Here | Does |
| --- | --- | --- |
| Business | `merchant` | pays a fee to register, then creates plans |
| Customer | `user` | subscribes, renews, cancels |
| Stripe | `protocol` (owner) | sets the fee rate, takes a % of every payment |

Each payment splits in one tx: **user → merchant** (bulk) + **user → feeRecipient** (fee).

## 3 core functions

```solidity
subscribe(planId, periods)   // pay periods × price, expiry = now + periods × interval
renew(subId, periods)        // expiry = max(oldExpiry, now) + periods × interval  (correct early or late)
cancel(subId)                // stop renewals
```

`subId = keccak256(subscriber, planId)` — deterministic, one active sub per (user, plan), no duplicates possible.

## Deployed

⭐ **Base Sepolia** — USDC is an open-mint mock, so you can fund yourself and run the full flow.

`0xc91a…3665` · [Basescan](https://sepolia.basescan.org/address/0xc91a4d1B95Ea603f01125b9590baF130613a3665) · fee 2.5%, merchantFee 10 USDC

## Develop

Foundry · Solidity 0.8.30 · Solady.

```bash
make build test fmt      # forge build / test / fmt
make deploy-base-sepolia # broadcast + verify (needs .env)
make mint approve        # fund yourself, then registerMerchant → createPlan → subscribe
```

---
*Gate 1 of **onchain-stripe**. Events feed a Goldsky indexer → Postgres → Hono API → Next.js dashboard.*
