"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useDisconnectWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { useEffect, useRef, useState } from "react";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletPill() {
  const wallets = useWallets();
  const account = useCurrentAccount();
  const { mutate: connect, isPending: connecting } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function copyAddress() {
    if (!account) return;
    await navigator.clipboard.writeText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 border-2 border-white bg-[#ffffcc] px-3 py-[2px] text-[12px] font-bold text-[#003399]"
        style={{ boxShadow: "2px 2px 0 #001a66" }}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{
          background: account ? "#33cc33" : "#cc0000",
          boxShadow: account
            ? "0 0 4px #33cc33"
            : "0 0 4px #cc0000",
        }} />
        {account ? short(account.address) : connecting ? "Connecting…" : "Connect Wallet"}
        <span className="text-[10px]">▼</span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-[220px] border-2 border-[#003399] bg-white text-black"
          style={{ boxShadow: "3px 3px 0 #001a66" }}
        >
          <div className="bg-[#003399] px-2 py-[2px] text-[11px] font-bold text-white">
            {account ? "▼ Connected" : "▼ Choose a wallet"}
          </div>

          {!account && (
            <div className="p-2">
              {wallets.length === 0 && (
                <p className="text-[11px] text-[#cc0000]">
                  No Sui wallets detected. Install Suiet, Sui Wallet, or Phantom.
                </p>
              )}
              <ul className="space-y-1">
                {wallets.map((w) => (
                  <li key={w.name}>
                    <button
                      type="button"
                      onClick={() => {
                        connect({ wallet: w }, { onSuccess: () => setOpen(false) });
                      }}
                      className="flex w-full items-center gap-2 border border-[#888] bg-[#f5f5ee] px-2 py-1 text-left text-[12px] hover:bg-[#e6eef8]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {w.icon && (
                        <img src={w.icon} alt="" className="h-4 w-4" />
                      )}
                      {w.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {account && (
            <div className="p-2 text-[11px]">
              <div className="break-all rounded-sm border border-dashed border-[#888] bg-[#f5f5ee] px-2 py-1">
                {account.address}
              </div>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={copyAddress}
                  className="flex-1 border border-[#666] bg-[#e5e5e5] px-2 py-1 text-[11px] hover:bg-[#d8d8d8]"
                  style={{
                    boxShadow: "inset -1px -1px 0 #888, inset 1px 1px 0 #fff",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    disconnect();
                    setOpen(false);
                  }}
                  className="flex-1 border border-[#666] bg-[#ffe5e5] px-2 py-1 text-[11px] font-bold text-[#cc0000] hover:bg-[#ffd0d0]"
                  style={{
                    boxShadow: "inset -1px -1px 0 #888, inset 1px 1px 0 #fff",
                  }}
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
