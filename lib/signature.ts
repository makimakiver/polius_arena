import {
  verifyPersonalMessageSignature,
  verifyTransactionSignature,
} from "@mysten/sui/verify";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { buildRegistrationMessage, type Role } from "./protocol";

export interface SignaturePayload {
  agent_name: string;
  address: string;
  description: string;
  role: Role;
  ts: string;
  nonce: string;
  signature: string;
  /** Optional: when present, verify in transaction-wrap mode (Sui CLI path). */
  tx_bcs_b64?: string;
}

export type SignatureCheck =
  | { ok: true; mode: "personal" | "tx" }
  | { ok: false; status: 401 | 403; error: string; detail?: unknown };

/**
 * Verify a registration signature against the claimed `address`.
 *
 * Two modes:
 *   - "personal": signature is over the canonical message bytes via
 *     Sui personal-message scheme. Used by SDK clients (browser/script).
 *   - "tx": signature is over a TransactionData blob (`tx_bcs_b64`) whose
 *     ProgrammableTransaction has exactly one Pure input containing the
 *     canonical message bytes. Used when signing via `sui keytool sign`,
 *     which cannot sign arbitrary bytes as a personal message.
 */
export async function verifyAgentSignature(
  payload: SignaturePayload,
): Promise<SignatureCheck> {
  const expectedMessage = buildRegistrationMessage({
    agent_name: payload.agent_name,
    address: payload.address,
    description: payload.description,
    role: payload.role,
    ts: payload.ts,
    nonce: payload.nonce,
  });

  if (payload.tx_bcs_b64) {
    return verifyTxMode(payload, expectedMessage);
  }
  return verifyPersonalMode(payload, expectedMessage);
}

async function verifyPersonalMode(
  payload: SignaturePayload,
  message: Uint8Array,
): Promise<SignatureCheck> {
  let recovered;
  try {
    recovered = await verifyPersonalMessageSignature(message, payload.signature);
  } catch (e) {
    return {
      ok: false,
      status: 401,
      error: "invalid personal-message signature",
      detail: (e as Error).message,
    };
  }
  const recoveredAddr = recovered.toSuiAddress();
  if (recoveredAddr !== payload.address) {
    return {
      ok: false,
      status: 403,
      error: "signature does not match address",
      detail: { expected: payload.address, recovered: recoveredAddr },
    };
  }
  return { ok: true, mode: "personal" };
}

async function verifyTxMode(
  payload: SignaturePayload,
  expectedMessage: Uint8Array,
): Promise<SignatureCheck> {
  const txBytes = base64ToBytes(payload.tx_bcs_b64!);

  // 1) crypto: signature is valid over these tx bytes for the claimed address
  let recovered;
  try {
    recovered = await verifyTransactionSignature(txBytes, payload.signature);
  } catch (e) {
    return {
      ok: false,
      status: 401,
      error: "invalid transaction signature",
      detail: (e as Error).message,
    };
  }
  if (recovered.toSuiAddress() !== payload.address) {
    return {
      ok: false,
      status: 403,
      error: "signature does not match address",
      detail: {
        expected: payload.address,
        recovered: recovered.toSuiAddress(),
      },
    };
  }

  // 2) tx layout: must be a ProgrammableTransaction with exactly one Pure
  //    input whose bytes are bcs(vector<u8>(expectedMessage)).
  let txData;
  try {
    txData = Transaction.from(txBytes).getData();
  } catch (e) {
    return {
      ok: false,
      status: 401,
      error: "could not decode tx_bcs_b64 as TransactionData",
      detail: (e as Error).message,
    };
  }

  const pureInputs = (txData.inputs ?? []).filter(
    (i: { Pure?: { bytes?: string } | null }) => i?.Pure != null,
  );
  if (pureInputs.length !== 1) {
    return {
      ok: false,
      status: 403,
      error: `expected exactly 1 pure input, got ${pureInputs.length}`,
    };
  }

  const pureB64 = (pureInputs[0] as { Pure: { bytes: string } }).Pure.bytes;
  const pureBytes = base64ToBytes(pureB64);

  // The pure input is a BCS-encoded `vector<u8>` whose contents must equal
  // our canonical message bytes.
  let inner: Uint8Array;
  try {
    inner = new Uint8Array(bcs.vector(bcs.u8()).parse(pureBytes));
  } catch (e) {
    return {
      ok: false,
      status: 403,
      error: "pure input is not a vector<u8>",
      detail: (e as Error).message,
    };
  }

  if (!bytesEqual(inner, expectedMessage)) {
    return {
      ok: false,
      status: 403,
      error: "embedded message does not match canonical registration message",
    };
  }

  return { ok: true, mode: "tx" };
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
