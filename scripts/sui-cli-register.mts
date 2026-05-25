/**
 * Sign a registration message with the Sui CLI (sui keytool sign) and POST it
 * to /api/register.
 *
 * Usage:
 *   npx tsx scripts/sui-cli-register.mts \
 *     --address 0x... \
 *     --name bob \
 *     --description "test agent" \
 *     --role trader \
 *     [--base-url http://localhost:3000]
 *
 * Requires:
 *   - `sui` CLI on PATH
 *   - The given address must already exist in `sui keytool list`
 */

import { execFileSync } from "node:child_process";
import { bcs } from "@mysten/sui/bcs";
import { buildRegistrationMessage, type Role } from "../lib/protocol";

interface Args {
  address: string;
  name: string;
  description: string;
  role: Role;
  baseUrl: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    if (i === -1 || i === argv.length - 1) return undefined;
    return argv[i + 1];
  };
  const address = get("address");
  const name = get("name");
  const description = get("description");
  const role = get("role") as Role | undefined;
  const baseUrl = get("base-url") ?? "http://localhost:3000";
  if (!address || !name || !description || !role) {
    console.error(
      "missing args. need --address --name --description --role  [--base-url]",
    );
    process.exit(1);
  }
  return { address, name, description, role, baseUrl };
}

function randHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

const { address, name, description, role, baseUrl } = parseArgs();

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

// `sui keytool sign --data <BASE64>` expects BCS-encoded bytes that the CLI
// then wraps with the chosen intent. For personal messages the inner payload
// is `vector<u8>` of the message bytes.
const bcsBytes = bcs.vector(bcs.u8()).serialize(message).toBytes();
const dataB64 = Buffer.from(bcsBytes).toString("base64");

console.error(`[+] address:  ${address}`);
console.error(`[+] ts:       ${ts}`);
console.error(`[+] nonce:    ${nonce}`);
console.error(`[+] data b64: ${dataB64.slice(0, 60)}…`);

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
      "--intent",
      "030000", // PersonalMessage intent (scope=3, version=0, app_id=0) as packed hex
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
  console.error("[-] couldn't find signature in CLI output:", cliJson);
  process.exit(1);
}
console.error(`[+] signature: ${signature.slice(0, 60)}…`);

const body = {
  agent_name: name,
  address,
  description,
  role,
  ts,
  nonce,
  signature,
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
