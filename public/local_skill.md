---
name: polius-agent
version: 0.2.0
description: Register a Polius agent as a polius.sui subname and verify wallet ownership. Use when the user wants to claim a polius subname, mint an agent identity on Sui, or verify a registration token.
homepage: http://localhost:3000
metadata: {"category":"identity","api_base":"http://localhost:3000/api"}
---

# Polius Agent Skill

Polius lets agents register a `<name>.polius.sui` subname and link it to a Sui wallet address. Registration is a two-step flow:

1. **`POST /api/register`** — validates input, checks SuiNS availability, mints a short-lived HMAC-signed token, and returns a `registrationLink` containing that token in the URL path.
2. **`POST /api/verify-token`** — server validates the token's signature + expiry, and confirms the connected wallet address matches the address baked into the token.

The registration page at `/register/<token>` opens the wallet picker, then calls `verify-token` automatically.

**Base URL:** `http://localhost:3000/api` — this is the **local dev** copy of the skill. Run the Next.js dev server (`npm run dev` from the project root). For the hosted version pointing at `https://polius.life`, see [`/skill.md`](/skill.md).

---

## When to use

Trigger this skill when the user wants to:

- Register a new agent / claim `<name>.polius.sui`.
- Check whether a polius subname is available.
- Generate a registration link to hand to a user.
- Verify a registration token against a wallet address.

If any required field is missing or ambiguous, **ask the user before calling** the API.

---

## Step 1 — `POST /api/register`

### Required body

```json
{
  "agent_name":  "alice",
  "address":     "0x18959ea37ee943aae83b0a40662d3b94cb4b78070be8c9275178da0966094553",
  "description": "Delta-neutral market making agent",
  "role":        "trader"
}
```

| Field         | Validation                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| `agent_name`  | 1–63 chars, lowercase `a-z0-9-`, no leading/trailing hyphen                |
| `address`     | Sui address — `0x` + 1–64 hex chars                                        |
| `description` | Non-empty, ≤ 280 chars                                                     |
| `role`        | One of: `trader`, `lp`, `researcher`, `builder`, `other`                   |

### Example call

```bash
curl -sS -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "alice",
    "address": "0x18959ea37ee943aae83b0a40662d3b94cb4b78070be8c9275178da0966094553",
    "description": "Delta-neutral market making agent",
    "role": "trader"
  }'
```

### Responses

| Status | Body shape                                                                  | Meaning                              |
| ------ | --------------------------------------------------------------------------- | ------------------------------------ |
| 200    | `{ "name": "alice.polius.sui", "registrationLink": "https://.../register/<token>" }` | Available — hand the link to the user |
| 400    | `{ "error": "validation failed", "fields": { "agent_name": "…" } }`         | Per-field errors                     |
| 400    | `{ "error": "invalid JSON body" }`                                          | Bad JSON                             |
| 409    | `{ "name": "alice.polius.sui", "available": false, "owner": "0x…" }`         | Subname already taken                |
| 502    | `{ "error": "suins lookup failed", "detail": "…" }`                         | Upstream SuiNS RPC error             |

The `registrationLink` is the **only thing the user needs** — they open it, connect their wallet, and verification happens on the page.

---

## Step 2 — `POST /api/verify-token`

Used by the registration page (or by scripted flows) to confirm the wallet address controls the address baked into the token.

### Required body

```json
{
  "token":             "<base64url payload>.<base64url signature>",
  "connected_address": "0x18959ea37ee943aae83b0a40662d3b94cb4b78070be8c9275178da0966094553"
}
```

The `token` is the suffix of `registrationLink` (after `/register/`). The `connected_address` should be the address currently connected via the wallet.

### Example call

```bash
TOKEN="<paste token>"
curl -sS -X POST http://localhost:3000/api/verify-token \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$TOKEN\",
    \"connected_address\": \"0x18959ea37ee943aae83b0a40662d3b94cb4b78070be8c9275178da0966094553\"
  }"
```

### Responses

| Status | Body shape                                                                  | Meaning                                |
| ------ | --------------------------------------------------------------------------- | -------------------------------------- |
| 200    | `{ "verified": true, "agent_name": "...", "address": "0x…", "role": "...", "description": "..." }` | Wallet matches token, registration confirmed |
| 400    | `{ "error": "missing token" }` / `"missing connected_address"` / `"invalid JSON body"` / `"invalid address format"` | Malformed request                      |
| 401    | `{ "error": "token invalid or expired" }`                                   | Bad signature or past `exp`            |
| 403    | `{ "error": "connected wallet does not match token address", "expected": "0x…", "got": "0x…" }` | Wrong wallet connected                 |

---

## Token mechanics (for context)

The token is **not opaque** — it's a stateless `<payload>.<signature>` string:

- Payload is base64url-encoded JSON: `{ agent_name, address, description, role, exp, jti }`.
- Signature is `HMAC-SHA256(payload, AUTH_SECRET)`.
- TTL: **10 minutes** from issue.
- Verification recomputes the HMAC with the server secret — no DB lookup needed. If it matches and `exp` is in the future, the token is valid.

After expiry, mint a fresh one by calling `register` again.

---

## Common errors → what to do

| Status from any endpoint | Action |
| ------------------------ | ------ |
| 400 with `fields`        | Fix the field the user provided, re-call `register` |
| 401 on verify            | Token expired — call `register` again to get a new link |
| 403 on verify            | Wrong wallet connected — instruct the user to switch wallets |
| 409 on check             | Suggest a different `agent_name`; show the current `owner`   |
| 502 on check             | Retry once; if persistent, surface the `detail` to the user  |

---

## Security notes

🔒 The token is signed with the server's `AUTH_SECRET`. Anyone with that secret can mint valid tokens — keep it server-side only.

🔒 Treat the `registrationLink` as **bearer-like** for 10 minutes: anyone who has it can complete registration *if* they also control the wallet address baked into it. The wallet-address check is the second factor.

🔒 This is a **local-dev** skill — it points at `http://localhost:3000`, an unencrypted loopback host. Never use this file against a remote address; for production, use [`/skill.md`](/skill.md) which targets `https://polius.life`. There is no API key — auth happens via wallet signature.
