#!/bin/sh
# Installs the openpanel CLI: downloads the binary for this machine from the
# latest GitHub release, verifies its sha256, and puts it on your PATH.
#
#   curl -fsSL https://raw.githubusercontent.com/Openpanel-dev/openpanel/main/self-hosting/install.sh | sh
#
# Environment:
#   OPENPANEL_INSTALL_DIR   Where to put the binary (default: /usr/local/bin, else ~/.local/bin)
#   OPENPANEL_RELEASES_API  Release feed to read (default: GitHub)
set -eu

RELEASES_API="${OPENPANEL_RELEASES_API:-https://api.github.com/repos/Openpanel-dev/openpanel/releases?per_page=30}"
TAG_PREFIX="v"

fail() {
  echo "error: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) fail "the openpanel CLI runs on the Linux server that hosts OpenPanel. To try it on a Mac, run it from source: cd self-hosting/cli && bun install && bun src/main.ts --help" ;;
  *) fail "unsupported OS: $(uname -s). The openpanel CLI runs on Linux servers." ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) fail "unsupported CPU: $(uname -m)" ;;
esac

asset="openpanel-$os-$arch"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Finding the latest release..."
curl -fsSL "$RELEASES_API" -o "$tmp/releases.json" || fail "could not reach $RELEASES_API"

# Each release object lists its tag before its assets. The newest release that
# carries this machine's binary is the one to install: every public self-hosting
# release does, and internal version tags never become releases at all.
# The newest release carrying this machine's binary. Builds of main are
# pre-releases: skipped while a public release exists, used only before the
# first one (supporters then move to the builds with `openpanel upgrade --supporter`).
find_release() {
  awk -v prefix="\"$TAG_PREFIX" -v name="/$asset\"" -v pre="$1" '
    /"tag_name":/ { split($0, parts, "\""); current = (index("\"" parts[4], prefix) == 1) ? parts[4] : "" }
    /"prerelease": *true/ && pre != 1 { current = "" }
    current != "" && /"browser_download_url":/ && index($0, name) { print current; exit }
  ' "$tmp/releases.json"
}

tag="$(find_release 0)"
if [ -z "$tag" ]; then
  tag="$(find_release 1)"
  if [ -n "$tag" ]; then
    echo "No public release yet; installing the newest build ($tag)."
  fi
fi
[ -n "$tag" ] || fail "no release with $asset found"

url_for() {
  awk -v tag="$tag" -v name="$1" '
    /"tag_name":/ { active = index($0, "\"" tag "\"") > 0 }
    active && /"browser_download_url":/ && index($0, "/" name "\"") { gsub(/.*"browser_download_url": *"|".*/, ""); print; exit }
  ' "$tmp/releases.json"
}

binary_url="$(url_for "$asset")"
checksums_url="$(url_for checksums.txt)"
[ -n "$binary_url" ] && [ -n "$checksums_url" ] || fail "release $tag has no $asset or checksums.txt"

echo "Downloading $asset ($tag)..."
curl -fsSL "$binary_url" -o "$tmp/$asset" || fail "download failed"
curl -fsSL "$checksums_url" -o "$tmp/checksums.txt" || fail "could not download checksums.txt"

expected="$(grep " \*\?$asset\$" "$tmp/checksums.txt" | cut -d' ' -f1)"
[ -n "$expected" ] || fail "checksums.txt has no entry for $asset"
[ "$(sha256 "$tmp/$asset")" = "$expected" ] || fail "checksum mismatch; refusing to install"
chmod +x "$tmp/$asset"

dir="${OPENPANEL_INSTALL_DIR:-}"
if [ -z "$dir" ]; then
  if [ -w /usr/local/bin ]; then
    dir=/usr/local/bin
  # Under `curl | sh` stdin is the script, so ask whether a terminal exists for
  # sudo to prompt on, rather than whether stdin is one.
  elif command -v sudo >/dev/null 2>&1 && (: </dev/tty) 2>/dev/null; then
    dir=/usr/local/bin
    use_sudo=1
  else
    dir="$HOME/.local/bin"
  fi
fi

mkdir -p "$dir" 2>/dev/null || true
if [ "${use_sudo:-0}" = 1 ]; then
  sudo mv "$tmp/$asset" "$dir/openpanel"
else
  mv "$tmp/$asset" "$dir/openpanel"
fi

echo "Installed openpanel $tag to $dir/openpanel"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "Add $dir to your PATH to run it." ;;
esac
echo "Next: openpanel init"
