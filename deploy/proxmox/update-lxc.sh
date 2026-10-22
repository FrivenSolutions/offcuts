#!/usr/bin/env bash
# Copies this checkout into an existing Offcuts LXC container and installs it.
# Use it for the first install (create-lxc.sh calls it) and for updates:
#   git pull && bash deploy/proxmox/update-lxc.sh <CTID>
set -euo pipefail

CTID="${1:?Usage: update-lxc.sh <CTID>}"
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TARBALL=$(mktemp --suffix=.tar.gz)
trap 'rm -f "$TARBALL"' EXIT

printf '\n\033[1;34m==> %s\033[0m\n' "Copying source into container $CTID"
tar -C "$ROOT" --exclude=node_modules --exclude=build --exclude=data --exclude=.git -czf "$TARBALL" .
pct push "$CTID" "$TARBALL" /root/offcuts-src.tar.gz
pct push "$CTID" "$ROOT/deploy/proxmox/install.sh" /root/offcuts-install.sh
pct exec "$CTID" -- bash /root/offcuts-install.sh /root/offcuts-src.tar.gz
pct exec "$CTID" -- rm -f /root/offcuts-src.tar.gz /root/offcuts-install.sh
