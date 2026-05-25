import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { SuinsClient } from "@mysten/suins";
import { issueToken } from "@/lib/token";
import { verifyAgentSignature } from "@/lib/signature";

const PARENT = "polius.sui";
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;
const MAX_DESCRIPTION = 280;
const ALLOWED_ROLES = ["trader", "lp", "researcher", "builder", "other"] as const;
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

type Role = (typeof ALLOWED_ROLES)[number];

interface RegisterBody {
  agent_name: string;
  address: string;
  description: string;
  role: Role;
  ts: string;
  nonce: string;
  signature: string;
  tx_bcs_b64?: string;
}

const suins = new SuinsClient({
  client: new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  }),
  network: "testnet",
});

function validate(
  input: unknown,
): { ok: true; body: RegisterBody } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: { _: "request body must be a JSON object" } };
  }
  const raw = input as Record<string, unknown>;

  const agent_name = typeof raw.agent_name === "string" ? raw.agent_name.trim().toLowerCase() : "";
  if (!agent_name) errors.agent_name = "required";
  else if (!LABEL_RE.test(agent_name))
    errors.agent_name = "1–63 chars, lowercase letters/digits/hyphens, no leading or trailing hyphen";

  const address = typeof raw.address === "string" ? raw.address.trim() : "";
  if (!address) errors.address = "required";
  else if (!SUI_ADDRESS_RE.test(address)) errors.address = "must be a 0x-prefixed Sui address";

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description) errors.description = "required";
  else if (description.length > MAX_DESCRIPTION)
    errors.description = `must be ≤ ${MAX_DESCRIPTION} characters`;

  const role = typeof raw.role === "string" ? raw.role.trim().toLowerCase() : "";
  if (!role) errors.role = "required";
  else if (!ALLOWED_ROLES.includes(role as Role))
    errors.role = `must be one of: ${ALLOWED_ROLES.join(", ")}`;

  const ts = typeof raw.ts === "string" ? raw.ts.trim() : "";
  const parsedTs = ts ? Date.parse(ts) : NaN;
  if (!ts) errors.ts = "required (ISO-8601 timestamp included in signed message)";
  else if (Number.isNaN(parsedTs)) errors.ts = "must be an ISO-8601 timestamp";
  else if (Math.abs(Date.now() - parsedTs) > SIGNATURE_MAX_AGE_MS)
    errors.ts = `must be within ±${SIGNATURE_MAX_AGE_MS / 60_000} minutes of server time`;

  const nonce = typeof raw.nonce === "string" ? raw.nonce.trim() : "";
  if (!nonce) errors.nonce = "required (random nonce included in signed message)";
  else if (!/^[a-f0-9]{8,128}$/i.test(nonce))
    errors.nonce = "must be 8–128 hex chars";

  const signature = typeof raw.signature === "string" ? raw.signature.trim() : "";
  if (!signature) errors.signature = "required (sign the canonical message with the address keypair)";

  const tx_bcs_b64 =
    typeof raw.tx_bcs_b64 === "string" && raw.tx_bcs_b64.trim()
      ? raw.tx_bcs_b64.trim()
      : undefined;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    body: {
      agent_name,
      address,
      description,
      role: role as Role,
      ts,
      nonce,
      signature,
      tx_bcs_b64,
    },
  };
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = validate(raw);
  if (!result.ok) {
    return Response.json({ error: "validation failed", fields: result.errors }, { status: 400 });
  }

  const { agent_name, address, description, role, ts, nonce, signature, tx_bcs_b64 } = result.body;

  const sigResult = await verifyAgentSignature({
    agent_name, address, description, role, ts, nonce, signature, tx_bcs_b64,
  });
  if (!sigResult.ok) {
    return Response.json(
      { error: sigResult.error, detail: sigResult.detail },
      { status: sigResult.status },
    );
  }

  const fullName = `${agent_name}.${PARENT}`;

  let record: Awaited<ReturnType<typeof suins.getNameRecord>> | null = null;
  try {
    record = await suins.getNameRecord(fullName);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (!/does not exist/i.test(msg)) {
      return Response.json({ error: "suins lookup failed", detail: msg }, { status: 502 });
    }
  }

  if (record) {
    return Response.json(
      { name: fullName, available: false, owner: record.targetAddress ?? null },
      { status: 409 },
    );
  }

  const token = issueToken({ agent_name, address, description, role });
  const origin = new URL(req.url).origin;
  const registrationLink = `${origin}/register/${encodeURIComponent(token)}`;

  return Response.json({
    name: fullName,
    registrationLink,
  });
}
