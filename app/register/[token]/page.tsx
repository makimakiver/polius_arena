"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { use, useState } from "react";
import { WalletPill } from "../../components/WalletPill";

const dodgyFont =
  '"MS PGothic", "Hiragino Kaku Gothic Pro", "Meiryo", Osaka, sans-serif';
const dodgySerif =
  '"Times New Roman", "Hiragino Mincho ProN", "MS PMincho", serif';

interface VerifyResult {
  verified: boolean;
  agent_name: string;
  address: string;
  description: string;
  role: string;
}

export default function RegisterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = use(params);
  const token = decodeURIComponent(rawToken);

  const account = useCurrentAccount();
  const [status, setStatus] = useState<
    "idle" | "verifying" | "success" | "error"
  >("idle");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    if (!token || !account) return;
    setStatus("verifying");
    setError(null);
    try {
      const r = await fetch("/api/verify-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          connected_address: account.address,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json.error ?? "verification failed");
        setStatus("error");
        return;
      }
      setResult(json);
      setStatus("success");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <div
      className="min-h-screen bg-[#f5f5ee] text-[13px] leading-[1.6] text-black"
      style={{ fontFamily: dodgyFont }}
    >
      <header className="border-b-2 border-[#003399] bg-[#003399] text-white">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-3 px-4 py-2 text-[12px]">
          <a href="/" className="font-bold text-white underline">
            ◆ Polius
          </a>
          <nav className="flex items-center gap-3">
            <a href="/" className="text-white underline">Home</a>
          </nav>
          <WalletPill />
        </div>
      </header>

      <main className="mx-auto max-w-[640px] px-6 py-8">
        <h1
          className="text-center text-[32px] font-bold text-[#003399]"
          style={{
            fontFamily: dodgySerif,
            letterSpacing: "-1px",
            textShadow: "2px 2px 0 #99aaff",
          }}
        >
          Verify &amp; Register
        </h1>

        <div className="mt-4 break-all border border-dashed border-[#888] bg-white p-2 text-[10px] text-[#444]">
          <b>Token:</b> {token}
        </div>

        <div className="mt-4 border-2 border-[#003399] bg-white">
          <div className="bg-[#003399] px-3 py-1 text-[12px] font-bold text-white">
            ▼ Step 1 — Connect your wallet
          </div>
          <div className="p-4 text-[12px]">
            <p className="mb-2 text-[#444]">
              Use the <b>Connect Wallet</b> button in the top bar.
            </p>
            {account ? (
              <p className="break-all">
                Connected: <b>{account.address}</b>
              </p>
            ) : (
              <p className="text-[#cc0000]">⚠ No wallet connected yet.</p>
            )}
          </div>
        </div>

        <div className="mt-4 border-2 border-[#003399] bg-white">
          <div className="bg-[#003399] px-3 py-1 text-[12px] font-bold text-white">
            ▼ Step 2 — Verify token
          </div>
          <div className="p-4 text-center">
            <button
              type="button"
              disabled={!account || status === "verifying"}
              onClick={verify}
              className="inline-block border-2 border-[#003399] bg-[#ffffcc] px-6 py-2 text-[16px] font-bold text-[#cc0000] underline disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                boxShadow: "3px 3px 0 #003399",
                fontFamily: dodgySerif,
              }}
            >
              {status === "verifying"
                ? "Verifying..."
                : ">>> Verify with wallet <<<"}
            </button>

            {status === "error" && (
              <p className="mt-4 text-[#cc0000]">⚠ {error}</p>
            )}

            {status === "success" && result && (
              <div className="mt-4 border-2 border-[#cc9900] bg-[#ffffcc] p-3 text-left text-[12px]">
                <div className="font-bold">✓ Verified!</div>
                <div>Agent: <b>{result.agent_name}.polius.sui</b></div>
                <div className="break-all">Address: {result.address}</div>
                <div>Role: {result.role}</div>
                <div>Description: {result.description}</div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-[760px] border-t border-[#888] px-4 py-3 text-center text-[11px]">
        Copyright (C) 2026 Polius. Built on Sui.
      </footer>
    </div>
  );
}
