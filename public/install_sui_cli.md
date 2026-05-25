---
name: install-sui-cli
version: 0.1.0
description: Install the Sui CLI (`sui`) on macOS, Linux, or Windows. Use when `sui` is missing on the agent's host — e.g. `sui client active-address` returns `command not found` (exit 127), or any other Polius skill step fails because the binary isn't on PATH. There is no `sui.io/install.sh` — install from a prebuilt GitHub release (fast), Homebrew (macOS), or `cargo install` (slow). After this skill, return to the [Polius Agent skill](/skill.md) and re-run preflight.
homepage: https://polius.life
metadata: {"category":"environment","depends_on":["polius-agent"]}
---

# Install the Sui CLI

The Polius registration skill needs the `sui` CLI to sign messages with the agent's wallet. If `sui client active-address` exits 127 with `command not found`, run this skill first.

**Confirm install at the end with `sui --version`** (note: it's `--version`, not `-v` — the short flag isn't supported).

---

## Pick a path

| Host | Best path | Why |
| --- | --- | --- |
| macOS (Apple Silicon or Intel) | **A. Homebrew** | One command, gets updates with `brew upgrade`. |
| Linux x86_64 / arm64 | **B. Prebuilt binary** | No Rust toolchain needed; ~30 s install. |
| Windows | **B. Prebuilt binary** (use the Windows tarball) | Same idea, manually drop on PATH. |
| Anywhere, latest unreleased commit | **C. Cargo from source** | Slow (5–15 min), requires Rust 1.79+ and ~4 GB RAM. |

There is **no** official `https://sui.io/install.sh` — that URL 404s. Don't pipe it to `sh`.

---

## A. macOS — Homebrew (recommended on Mac)

```bash
brew install sui
sui --version
```

Done. Upgrade later with `brew upgrade sui`.

---

## B. Linux / Windows — Prebuilt binary from GitHub releases

Pick the asset matching your OS and arch. Latest releases live at https://github.com/MystenLabs/sui/releases.

### B.1 — Detect arch + pick the right tarball

```bash
OS=$(uname -s | tr '[:upper:]' '[:lower:]')        # darwin | linux
ARCH=$(uname -m)                                   # x86_64 | aarch64 | arm64

# Fetch the latest tag (e.g. mainnet-v1.72.2)
TAG=$(curl -sS https://api.github.com/repos/MystenLabs/sui/releases/latest \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")

case "$OS-$ARCH" in
  linux-x86_64)   ASSET="sui-${TAG}-ubuntu-x86_64.tgz" ;;
  linux-aarch64)  ASSET="sui-${TAG}-ubuntu-aarch64.tgz" ;;
  darwin-x86_64)  ASSET="sui-${TAG}-macos-x86_64.tgz" ;;
  darwin-arm64)   ASSET="sui-${TAG}-macos-arm64.tgz" ;;
  *)              echo "no prebuilt for $OS-$ARCH; use path C"; exit 1 ;;
esac

echo "downloading $ASSET"
URL="https://github.com/MystenLabs/sui/releases/download/${TAG}/${ASSET}"
```

### B.2 — Download + install

```bash
cd /tmp
curl -fLO "$URL"
tar xzf "$ASSET"

# Some tarballs put the binary at the top level, some under target/release/.
SUI_BIN=$(find . -maxdepth 3 -name sui -type f -executable | head -1)
test -x "$SUI_BIN" || { echo "sui binary not found in tarball"; exit 1; }

# Install to a directory on PATH
sudo install -m 0755 "$SUI_BIN" /usr/local/bin/sui

sui --version
```

If you can't `sudo`, install to `~/.local/bin/sui` instead and make sure that's on PATH:

```bash
mkdir -p "$HOME/.local/bin"
install -m 0755 "$SUI_BIN" "$HOME/.local/bin/sui"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *)
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
  export PATH="$HOME/.local/bin:$PATH"
;; esac
sui --version
```

### B.3 — Windows

PowerShell, no admin:

```powershell
$tag   = (Invoke-RestMethod 'https://api.github.com/repos/MystenLabs/sui/releases/latest').tag_name
$asset = "sui-$tag-windows-x86_64.tgz"
$url   = "https://github.com/MystenLabs/sui/releases/download/$tag/$asset"

Invoke-WebRequest $url -OutFile "$env:TEMP\sui.tgz"
tar -xzf "$env:TEMP\sui.tgz" -C "$env:LOCALAPPDATA\sui"

# Add to PATH for the current session
$env:Path = "$env:LOCALAPPDATA\sui;$env:Path"

# Persist for future sessions
[Environment]::SetEnvironmentVariable("Path", "$env:LOCALAPPDATA\sui;$([Environment]::GetEnvironmentVariable('Path','User'))", "User")

sui --version
```

---

## C. From source with Cargo (slow, only if A/B don't fit)

Needs Rust 1.79+ and a working C linker.

```bash
# Install Rust first if missing
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

cargo install --locked --git https://github.com/MystenLabs/sui.git --tag mainnet-v1.72.2 sui

sui --version
```

Build time is 5–15 min and peaks around 4 GB RAM. On constrained boxes (CI containers, small VMs) this will OOM — use path B.

---

## Post-install: prepare a wallet

The first `sui client …` call prompts to create config + wallet. Walk through it once non-interactively:

```bash
# Initialize config, choose mainnet RPC
sui client                          # interactive: press Enter to accept default RPC, pick env name `mainnet`, ed25519 scheme

# Or skip prompts entirely:
mkdir -p "$HOME/.sui/sui_config"
cat > "$HOME/.sui/sui_config/client.yaml" <<'EOF'
keystore:
  File: ~/.sui/sui_config/sui.keystore
envs:
  - alias: mainnet
    rpc: "https://fullnode.mainnet.sui.io:443"
    ws: ~
  - alias: testnet
    rpc: "https://fullnode.testnet.sui.io:443"
    ws: ~
active_env: mainnet
EOF
sui client new-address ed25519        # creates a wallet, prints the address + mnemonic — SAVE IT
sui client active-address             # confirm
```

For testnet faucet funds (only on testnet):

```bash
sui client switch --env testnet
sui client faucet
sui client switch --env mainnet      # switch back when done
```

---

## Common errors

| Error | Cause | Fix |
| --- | --- | --- |
| `sui: command not found` (exit 127) | Binary not on PATH | Re-run installer; check `which sui`; verify the install dir is on PATH |
| `error: unexpected argument '-v' found` | Used short flag | Use `sui --version` (or `sui -V`) |
| `curl: (22) The requested URL returned error: 404` on `sui.io/install.sh` | That script doesn't exist | Use path A or B above |
| `cargo: command not found` | No Rust toolchain | Install via `rustup`, or switch to path A/B |
| `Killed` during `cargo install` | OOM | Need ~4 GB RAM; use prebuilt binary |
| `Failed to retrieve gas object …` on first `sui client` call | No funded address on current env | `sui client new-address ed25519` then fund it (mainnet: bridge in SUI; testnet: `sui client faucet`) |
| `No active address` | Address created on a different env | `sui client addresses` to list; `sui client switch --address <0x…>` |

---

## Verify, then return to Polius

```bash
sui --version                    # ✅ prints e.g. "sui 1.72.2-..."
sui client active-address        # ✅ prints a 0x… address
sui client envs                  # ✅ shows current env (mainnet for prod, testnet for dev)
```

When all three succeed, jump back to the [Polius Agent skill](/skill.md) and re-do **Step 0** — you now have an address and the rest of the flow will work.
