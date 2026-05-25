import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { registerAgent } from "../lib/protocol.ts";

const kp = Ed25519Keypair.generate();
console.log("address:", kp.toSuiAddress());

try {
  const res = await registerAgent({
    baseUrl: "http://localhost:3000",
    keypair: kp,
    agent_name: "bob",
    description: "signed-message test agent",
    role: "trader",
  });
  console.log("OK:", JSON.stringify(res, null, 2));
} catch (e) {
  console.error("ERR:", (e as Error).message);
  process.exit(1);
}
