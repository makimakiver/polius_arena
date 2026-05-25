/**
 * Sign a registration message via `sui keytool sign` without ever exporting
 * the private key.
 *
 * The Sui CLI refuses to sign arbitrary bytes as a PersonalMessage — it always
 * BCS-decodes `--data` as TransactionData. So we wrap the canonical
 * registration message inside a real TransactionData: a ProgrammableTransaction
 * with one Pure input containing the message bytes. The server then:
 *   1) verifyTransactionSignature(tx_bytes, signature) → recovers the pubkey
 *   2) Decodes the tx, finds the single Pure input
 *   3) Confirms those bytes equal buildRegistrationMessage(...)
 *
 * Usage:
 *   npx tsx scripts/sui-cli-tx-register.mts \
 *     --address 0x... \
 *     --name carol \
 *     --description "agent" \
 *     --role trader \
 *     [--base-url http://localhost:3000] \
 *     [--network testnet|mainnet]
 *
 * Requires:
 *   - `sui` CLI on PATH; address must exist in `sui keytool list`.
 *   - Address must own at least one SUI coin on the chosen network (for gas).
 */

import { execFileSync } from "node:child_process";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { buildRegistrationMessage, type Role } from "../lib/protocol";

interface Args {
  address: string;
  name: string;
  description: string;
  role: Role;
  baseUrl: string;
  network: "testnet" | "mainnet";
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i === -1 || i === argv.length - 1 ? undefined : argv[i + 1];
  };
  const address = get("address");
  const name = get("name");
  const description = get("description");
  const role = get("role") as Role | undefined;
  const baseUrl = get("base-url") ?? "http://localhost:3000";
  const network = (get("network") ?? "testnet") as "testnet" | "mainnet";
  if (!address || !name || !description || !role) {
    console.error(
      "usage: --address 0x… --name <n> --description <d> --role <r> [--base-url URL] [--network testnet|mainnet]",
    );
    process.exit(1);
  }
  return { address, name, description, role, baseUrl, network };
}

function randHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

const { address, name, description, role, baseUrl, network } = parseArgs();

const ts = new Date().toISOString();
const nonce = randHex(16);

const message = buildRegistrationMessage({
  agent_name: name,
  address,
  description,
  role,
  ts,
  nonce,
});

console.error(`[+] address: ${address}`);
console.error(`[+] ts:      ${ts}`);
console.error(`[+] nonce:   ${nonce}`);
console.error(`[+] message: ${message.length} bytes`);

const rpc = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl(network),
  network,
});

// 1) Fetch a SUI coin to use as gas payment
const coins = await rpc.getCoins({ owner: address, coinType: "0x2::sui::SUI" });
if (coins.data.length === 0) {
  console.error(
    `[-] ${address} has no SUI coins on ${network}. ` +
      `Fund it via: sui client faucet (testnet) or transfer some SUI in.`,
  );
  process.exit(1);
}
const gas = coins.data[0];
console.error(`[+] gas coin: ${gas.coinObjectId} (${gas.balance} mist)`);

// 2) Build a ProgrammableTransaction with our message as a Pure input.
// We attach it as a single MoveCall arg so the BCS layout is well-formed.
// `0x1::option::some<vector<u8>>(message)` is a no-op-ish call that succeeds
// at build time and pins the message bytes into the tx.
const tx = new Transaction();
tx.setSender(address);
tx.setGasPayment([
  { objectId: gas.coinObjectId, version: gas.version, digest: gas.digest },
]);
tx.setGasBudget(2_000_000);
tx.setGasPrice(1000);

tx.moveCall({
  target: "0x1::option::some",
  typeArguments: ["vector<u8>"],
  arguments: [tx.pure(bcs.vector(bcs.u8()).serialize(message))],
});

const txBytes = await tx.build({ client: rpc });
const dataB64 = Buffer.from(txBytes).toString("base64");
console.error(`[+] tx bytes: ${txBytes.length} (${dataB64.slice(0, 60)}…)`);

// 3) Sign with the Sui CLI (key stays in the keystore)
let cliOut: string;
try {
  cliOut = execFileSync(
    "sui",
    [
      "keytool",
      "sign",
      "--address",
      address,
      "--data",
      dataB64,
      "--json",
    ],
    { encoding: "utf8" },
  );
} catch (e) {
  console.error("[-] sui keytool sign failed:", (e as Error).message);
  process.exit(1);
}
const cliJson = JSON.parse(cliOut);
const signature: string | undefined =
  cliJson.suiSignature ?? cliJson.serializedSignature ?? cliJson.sig;
if (!signature) {
  console.error("[-] no signature in CLI output:", cliJson);
  process.exit(1);
}
console.error(`[+] signature: ${signature.slice(0, 60)}…`);

// 4) POST to /api/register
const body = {
  agent_name: name,
  address,
  description,
  role,
  ts,
  nonce,
  signature,
  tx_bcs_b64: dataB64,
};

const res = await fetch(`${baseUrl}/api/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.error(`[+] HTTP ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
