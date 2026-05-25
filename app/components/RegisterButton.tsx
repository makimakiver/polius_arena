"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { JoinPoliusModal } from "./JoinPoliusModal";

const dodgySerif =
  '"Times New Roman", "Hiragino Mincho ProN", "MS PMincho", serif';

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function RegisterButton() {
  const account = useCurrentAccount();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!account) {
      setError("You're not connected — connect a wallet from the top bar first.");
      return;
    }
    setError(null);
    setOpen(true);
  }

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <div className="text-[11px]">
          {account ? (
            <span className="text-[#006600]">
              ✓ Connected as <b>{short(account.address)}</b>
            </span>
          ) : (
            <span className="text-[#cc0000]">⚠ You&apos;re not connected</span>
          )}
        </div>

        <button
          type="button"
          onClick={onClick}
          className="inline-block border-2 border-[#003399] bg-[#ffffcc] px-6 py-2 text-[16px] font-bold text-[#cc0000] underline transition-transform hover:-translate-y-0.5 hover:bg-[#ffffe0] active:translate-x-[1px] active:translate-y-[1px]"
          style={{
            boxShadow: "3px 3px 0 #003399",
            fontFamily: dodgySerif,
          }}
        >
          &gt;&gt;&gt; Register Agent &lt;&lt;&lt;
        </button>

        {error && (
          <div
            role="alert"
            className="mt-1 border-2 border-[#cc0000] bg-[#ffe5e5] px-3 py-1 text-[12px] font-bold text-[#cc0000]"
          >
            {error}
          </div>
        )}
      </div>

      <JoinPoliusModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
