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
TAG_PREFIX="cli-v"

fail() {
  echo "error: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) fail "unsupported OS: $(uname -s). Download a binary from the releases page instead." ;;
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

# Each release object lists its tag before its assets, so the first matching
# tag's asset URLs are the ones that follow it, up to the next tag.
tag="$(grep -o "\"tag_name\": *\"$TAG_PREFIX[^\"]*\"" "$tmp/releases.json" | head -n 1 | cut -d'"' -f4)"
[ -n "$tag" ] || fail "no $TAG_PREFIX release found"

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
  elif command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then
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
