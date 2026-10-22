#!/usr/bin/env bash
# Creates a Debian 12 LXC container on a Proxmox VE host and installs Offcuts in it.
# Run as root on the Proxmox host, from a checkout of this repository:
#   bash deploy/proxmox/create-lxc.sh
# Change the defaults with environment variables, for example:
#   CTID=120 IP=192.168.1.50/24 GW=192.168.1.1 STORAGE=local-zfs bash deploy/proxmox/create-lxc.sh
set -euo pipefail

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-offcuts}"
STORAGE="${STORAGE:-local-lvm}"            # Storage for the container disk
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"  # Storage that holds CT templates
BRIDGE="${BRIDGE:-vmbr0}"
IP="${IP:-dhcp}"                           # "dhcp" or CIDR such as 192.168.1.50/24
GW="${GW:-}"                               # Gateway, needed with a static IP
VLAN="${VLAN:-}"
CORES="${CORES:-1}"
MEMORY="${MEMORY:-1024}"                   # MB. The build step needs about 1 GB.
DISK="${DISK:-4}"                          # GB

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

command -v pct >/dev/null || { echo "Run this on a Proxmox VE host." >&2; exit 1; }
[[ $EUID -eq 0 ]] || { echo "Run this script as root." >&2; exit 1; }
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
[[ -f "$ROOT/package.json" ]] || { echo "Run this from a checkout of the Offcuts repository." >&2; exit 1; }

log "Finding the Debian 12 template"
pveam update >/dev/null
TEMPLATE=$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)
[[ -n "$TEMPLATE" ]] || { echo "No Debian 12 template found." >&2; exit 1; }
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[[ -n "$GW" ]] && NET="$NET,gw=$GW"
[[ -n "$VLAN" ]] && NET="$NET,tag=$VLAN"

log "Creating container $CTID ($CT_HOSTNAME)"
pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$CT_HOSTNAME" \
  --cores "$CORES" \
  --memory "$MEMORY" \
  --swap 512 \
  --rootfs "$STORAGE:$DISK" \
  --net0 "$NET" \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1 \
  --tags offcuts
pct start "$CTID"

log "Waiting for the network"
for _ in $(seq 1 30); do
  pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
  sleep 2
done
pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null || { echo "The container has no network." >&2; exit 1; }

"$ROOT/deploy/proxmox/update-lxc.sh" "$CTID"

log "Done"
echo "Container: $CTID ($CT_HOSTNAME)"
echo "Open a shell in it with:  pct enter $CTID"
