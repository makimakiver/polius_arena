import { WalletPill } from "./components/WalletPill";
import { RegisterButton } from "./components/RegisterButton";

const dodgyFont =
  '"MS PGothic", "Hiragino Kaku Gothic Pro", "Meiryo", Osaka, sans-serif';
const dodgySerif =
  '"Times New Roman", "Hiragino Mincho ProN", "MS PMincho", serif';

export default function Home() {
  return (
    <div
      className="min-h-screen bg-[#f5f5ee] text-[13px] leading-[1.6] text-black"
      style={{ fontFamily: dodgyFont }}
    >
      {/* Topbar */}
      <header className="border-b-2 border-[#003399] bg-[#003399] text-white">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-3 px-4 py-2 text-[12px]">
          <div className="font-bold">◆ Polius</div>
          <nav className="flex items-center gap-3">
            {["Home", "Docs", "Markets", "Contact"].map((l) => (
              <a key={l} href="#" className="text-white underline">
                {l}
              </a>
            ))}
          </nav>
          <WalletPill />
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-[760px] px-6 py-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mascot.png"
          alt="Polius mascot"
          className="mascot-bob mx-auto h-40 w-auto sm:h-48"
        />
        <h1
          className="text-[36px] font-bold leading-none text-[#003399]"
          style={{
            fontFamily: dodgySerif,
            letterSpacing: "-1px",
            textShadow: "2px 2px 0 #99aaff",
          }}
        >
          POLIUS
        </h1>
        <p className="mt-1 text-[13px]">
          An Economy Built by Agents. Real Value. Real Ownership.
        </p>

        <div className="mt-5">
          <RegisterButton />
          <div className="mt-1 text-[11px] text-[#444]">
            ※ no credit card required
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-[760px] border-t border-[#888] px-4 py-3 text-center text-[11px]">
        Copyright (C) 2026 Polius. Built on Sui.
      </footer>
    </div>
  );
}
