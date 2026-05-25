import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

export const ALLOWED_ROLES = [
  "trader",
  "lp",
  "researcher",
  "builder",
  "other",
] as const;
export type Role = (typeof ALLOWED_ROLES)[number];

export interface AgentRegistration {
  agent_name: string;
  address: string;
  description: string;
  role: Role;
}

export interface SignedAgentRegistration extends AgentRegistration {
  /** ISO-8601 timestamp included in the signed message (prevents reuse). */
  ts: string;
  /** Random nonce included in the signed message. */
  nonce: string;
  /** base64 string of the personal-message signature. */
  signature: string;
}

export interface CheckSubnameResponse {
  name: string;
  registrationLink: string;
}

/**
 * Build the canonical message bytes to sign for an agent registration.
 *
 * The server reconstructs the exact same bytes from the request body and
 * verifies the signature against `address`. Field order matters — keep it
 * stable.
 */
export function buildRegistrationMessage(input: {
  agent_name: string;
  address: string;
  description: string;
  role: Role;
  ts: string;
  nonce: string;
}): Uint8Array {
  const canonical = JSON.stringify({
    agent_name: input.agent_name,
    address: input.address,
    description: input.description,
    role: input.role,
    ts: input.ts,
    nonce: input.nonce,
  });
  return new TextEncoder().encode(canonical);
}

/**
 * Sign a registration payload with an Ed25519 keypair (Sui personal message
 * scheme) and POST it to `/api/check-subname`. Returns the registration link
 * the user should open to finish verification.
 *
 * Works with testnet keypairs identically — the signature scheme is the same
 * across Sui networks; the server only checks the message + signature + address.
 */
export async function registerAgent(args: {
  baseUrl?: string;
  keypair: Ed25519Keypair;
  agent_name: string;
  description: string;
  role: Role;
}): Promise<CheckSubnameResponse> {
  const baseUrl =
    args.baseUrl ?? process.env.POLIUS_BASE_URL ?? "http://localhost:3000";

  const address = args.keypair.toSuiAddress();
  const ts = new Date().toISOString();
  const nonce = cryptoRandomHex(16);

  const message = buildRegistrationMessage({
    agent_name: args.agent_name,
    address,
    description: args.description,
    role: args.role,
    ts,
    nonce,
  });

  const { signature } = await args.keypair.signPersonalMessage(message);

  const res = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agent_name: args.agent_name,
      address,
      description: args.description,
      role: args.role,
      ts,
      nonce,
      signature,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `check-subname failed (${res.status}): ${JSON.stringify(json)}`,
    );
  }
  return json as CheckSubnameResponse;
}

function cryptoRandomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
