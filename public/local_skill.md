---
name: polius-agent
version: 0.3.0
description: Register an agent as a polius.sui subname on the Sui network. Use when the user (or you, the agent) wants to claim a polius subname, mint an agent identity on Sui, or verify a registration token. The skill walks you through detecting your wallet via `sui client`, self-classifying your role + description, signing a registration message with the Sui CLI, and POSTing to /api/register.
homepage: http://localhost:3000
metadata: {"category":"identity","api_base":"http://localhost:3000/api"}
---

# Polius Agent Skill

Polius lets agents register a `<name>.polius.sui` subname and bind it to a Sui wallet. The flow:

1. **Preflight** — confirm `sui` CLI is installed, fetch the active address, and self-classify `role` + `description` from your own skill / system context.
2. **Sign** — build the canonical registration message and sign it with `sui keytool sign` (the private key never leaves the keystore).
3. **`POST /api/register`** — server verifies the signature, checks SuiNS availability, mints a 10-min HMAC token, and returns a `registrationLink`.
4. **Hand the link to the user** — they open it, connect the wallet, and the page POSTs to **`/api/verify-token`** automatically.

**Base URL:** `http://localhost:3000/api` (override with `POLIUS_BASE_URL` for local dev, e.g. `http://localhost:3000/api`).

---

## Step 0 — Preflight (do this first, every time)

### 0.1 — Confirm the Sui CLI is available and get the agent's address

```bash
sui client active-address
```

- **Success** → prints a `0x…` address. Capture it as `$ADDRESS`. This is the wallet you will register against.
- **`command not found`** (exit 127) → run the [Install Sui CLI skill](/install_sui_cli.md) first, then re-do this step. Don't pipe `sui.io/install.sh` — that URL 404s. Don't proceed with registration until `sui --version` works.
- **`There are no addresses…`** → tell the user: "Your Sui CLI has no addresses yet. Run `sui client new-address ed25519` first, fund it on the network you want to register on, then re-run this skill."
- **Wrong network** → check with `sui client envs`; testnet/mainnet must match the network Polius is deployed on (mainnet for prod). Switch with `sui client switch --env <name>` if needed.

### 0.2 — Self-classify your `role` and `description`

You (the agent reading this skill) must pick these from **your own** system prompt, tools, and persona — *not* by asking the user, unless your context is genuinely empty.

Allowed `role` values and what they signal:

| `role`       | When to pick it                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| `trader`     | You run strategies, place orders, manage positions, or do market-making.        |
| `lp`         | You provide liquidity, run vaults, or operate AMM positions.                    |
| `researcher` | You produce analysis, signals, on-chain forensics, or written reports.          |
| `builder`    | You write contracts, ship code, build tools, or compose other agents/services.  |
| `other`      | None of the above fits cleanly. Use sparingly.                                  |

`description` — one sentence (≤280 chars) summarizing what you do, written in agent-voice (e.g. *"Delta-neutral market-making agent for DeepBook USDC/SUI pairs"*).

`agent_name` — pick a short kebab-case label (1–63 chars, `a-z0-9-`, no leading/trailing hyphen). If unsure, ask the user once. This becomes `<agent_name>.polius.sui`.

---

## Step 1 — Sign the registration message with the Sui CLI

The server expects a canonical JSON message signed by the address's private key, wrapped inside a real `TransactionData` BCS blob (this is the only thing `sui keytool sign` will produce — see [Why a transaction wrapper?](#why-a-transaction-wrapper) below).

If the repo's `scripts/sui-cli-tx-register.mts` is available, just run it — it does all of Step 1 + Step 2 for you:

```bash
npx tsx scripts/sui-cli-tx-register.mts \
  --address "$ADDRESS" \
  --name <agent_name> \
  --description "<self-classified description>" \
  --role <self-classified role> \
  --network mainnet
```

Otherwise, do it manually:

1. Build the canonical message — JSON in this exact key order:
   ```json
   { "agent_name": "...", "address": "0x...", "description": "...", "role": "...", "ts": "<ISO-8601>", "nonce": "<16-byte hex>" }
   ```
2. BCS-encode the UTF-8 bytes as `vector<u8>` and embed in a `ProgrammableTransaction` with one `Pure` input (e.g. as the only arg to `0x1::option::some<vector<u8>>`). Set sender, a real owned gas coin, gas price 1000, gas budget 2_000_000.
3. `Transaction.build({ client })` → base64-encode → call `sui keytool sign --address $ADDRESS --data <b64> --json`. Extract `suiSignature` from the JSON output.

---

## Step 2 — `POST /api/register`

### Required body

```json
{
  "agent_name":  "alice",
  "address":     "0x18959ea37ee943aae83b0a40662d3b94cb4b78070be8c9275178da0966094553",
  "description": "Delta-neutral market making agent for DeepBook USDC/SUI",
  "role":        "trader",
  "ts":          "2026-05-25T01:23:45.000Z",
  "nonce":       "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "signature":   "<base64 from sui keytool sign>",
  "tx_bcs_b64":  "<base64 of the TransactionData built in Step 1>"
}
```

| Field         | Validation                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| `agent_name`  | 1–63 chars, lowercase `a-z0-9-`, no leading/trailing hyphen                |
| `address`     | Sui address — `0x` + 1–64 hex chars                                        |
| `description` | Non-empty, ≤ 280 chars                                                     |
| `role`        | One of: `trader`, `lp`, `researcher`, `builder`, `other`                   |
| `ts`          | ISO-8601, within ±5 minutes of server time                                 |
| `nonce`       | 8–128 hex chars                                                            |
| `signature`   | Output of `sui keytool sign` (or `signPersonalMessage` if no `tx_bcs_b64`) |
| `tx_bcs_b64`  | TransactionData BCS the signature commits to (required for CLI signing)    |

### Example call

```bash
curl -sS -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d @register.json
```

### Responses

| Status | Body shape                                                                                                          | Meaning                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 200    | `{ "name": "alice.polius.sui", "registrationLink": "https://.../register/<token>" }`                                | Available — hand the link to the user            |
| 400    | `{ "error": "validation failed", "fields": { "<field>": "…" } }`                                                    | Per-field errors                                 |
| 401    | `{ "error": "invalid transaction signature" }` / `"invalid personal-message signature"`                             | Signature didn't verify                          |
| 403    | `{ "error": "signature does not match address" }` / `"embedded message does not match canonical registration message" }` | Wrong key signed it, or tx wrapper tampered with |
| 409    | `{ "name": "alice.polius.sui", "available": false, "owner": "0x…" }`                                                | Subname already taken                            |
| 429    | `{ "error": "rate limited", "retry_after_seconds": <n> }`                                                           | 10 req/min/IP — wait                             |
| 502    | `{ "error": "suins lookup failed", "detail": "…" }`                                                                 | Upstream SuiNS RPC error                         |

The `registrationLink` is the **only thing the user needs** — they open it, connect their wallet, and verification happens on the page.

---

## Step 3 — `POST /api/verify-token` (usually automatic)

The `/register/<token>` page calls this for the user after they connect a wallet. You only call it directly for scripted/test flows.

### Required body

```json
{
  "token":             "<base64url payload>.<base64url signature>",
  "connected_address": "0x18959ea37ee943aae83b0a40662d3b94cb4b78070be8c9275178da0966094553"
}
```

### Responses

| Status | Body shape                                                                                                                  | Meaning                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 200    | `{ "verified": true, "agent_name": "...", "address": "0x…", "role": "...", "description": "..." }`                          | Wallet matches token, registration confirmed |
| 400    | `{ "error": "missing token" }` / `"missing connected_address"` / `"invalid JSON body"` / `"invalid address format"`         | Malformed request                            |
| 401    | `{ "error": "token invalid or expired" }`                                                                                   | Bad signature or past `exp`                  |
| 403    | `{ "error": "connected wallet does not match token address", "expected": "0x…", "got": "0x…" }`                             | Wrong wallet connected                       |
| 429    | `{ "error": "rate limited", "retry_after_seconds": <n> }`                                                                   | 30 req/min/IP                                |

---

## Token mechanics (for context)

The token returned in `registrationLink` is a stateless `<payload>.<signature>` string:

- Payload is base64url-encoded JSON: `{ agent_name, address, description, role, exp, jti }`.
- Signature is `HMAC-SHA256(payload, AUTH_SECRET)`.
- TTL: **10 minutes** from issue.
- Verification recomputes the HMAC with the server secret — no DB lookup needed. If it matches and `exp` is in the future, the token is valid.

After expiry, mint a fresh one by calling `/api/register` again.

### Why a transaction wrapper?

`sui keytool sign` refuses arbitrary bytes — it always BCS-decodes `--data` as `TransactionData`. To sign a personal message via the CLI we embed our message as a `Pure` input inside a real `ProgrammableTransaction`. The server then `verifyTransactionSignature(tx_bytes, signature)` recovers the pubkey, decodes the tx, and confirms the pure input bytes equal the canonical registration message. Same crypto guarantee as a personal message; works through the CLI without exporting the private key.

If you're signing from a TS / browser context with `signPersonalMessage`, send the signature in `signature` and **omit** `tx_bcs_b64`; the server falls back to personal-message verification.

---

## Common errors → what to do

| Status from any endpoint | Action                                                                            |
| ------------------------ | --------------------------------------------------------------------------------- |
| 400 with `fields`        | Fix the field, re-call `/api/register`                                            |
| 401 on register          | Signature didn't verify — re-build + re-sign, check ts within ±5 min              |
| 401 on verify-token      | Token expired — call `/api/register` again to get a new link                      |
| 403 on register          | Wrong key signed (address mismatch), or tx wrapper was tampered with              |
| 403 on verify            | Wrong wallet connected — instruct the user to switch wallets                      |
| 409 on register          | Suggest a different `agent_name`; show the current `owner`                        |
| 429 on either            | Back off `retry_after_seconds`; you're hitting 10/min on register, 30/min verify  |
| 502 on register          | Retry once; if persistent, surface the `detail` to the user                       |

---

## Security notes

🔒 The token is signed with the server's `AUTH_SECRET`. Anyone with that secret can mint valid tokens — keep it server-side only.

🔒 Treat the `registrationLink` as **bearer-like** for 10 minutes: anyone who has it can complete registration *if* they also control the wallet address baked into it. The wallet-address check is the second factor.

🔒 This is the **local-dev** skill — it points at `http://localhost:3000`. Never use this file against a remote host; for production use [`/skill.md`](/skill.md) which targets `https://polius.life`. There is no API key — authentication is done via wallet signature.
