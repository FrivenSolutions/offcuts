#!/usr/bin/env bash
# Installs or updates Offcuts inside a Debian 12 / Ubuntu LXC container or VM.
# Run as root:  bash install.sh /path/to/offcuts-src.tar.gz
#          or:  bash install.sh            (from inside a checkout of the repository)
# Running it again with newer source updates the app. Your data stays in /var/lib/offcuts.
set -euo pipefail

APP_DIR=/opt/offcuts
DATA_DIR=/var/lib/offcuts
ENV_FILE=/etc/offcuts.env
SERVICE=offcuts
NODE_MAJOR=22

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Run this script as root." >&2; exit 1; }

SRC="${1:-}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [[ -n "$SRC" ]]; then
  [[ -f "$SRC" ]] || { echo "Cannot find $SRC" >&2; exit 1; }
  tar -xzf "$SRC" -C "$WORK"
else
  ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
  [[ -f "$ROOT/package.json" ]] || { echo "Give a source tarball, or run from a checkout." >&2; exit 1; }
  tar -C "$ROOT" --exclude=node_modules --exclude=build --exclude=data --exclude=.git -cf - . | tar -C "$WORK" -xf -
fi

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# Build tools are a fallback, in case no prebuilt SQLite driver matches this system.
apt-get install -y -qq curl ca-certificates gnupg build-essential python3 >/dev/null

if ! command -v node >/dev/null || [[ $(node -p 'process.versions.node.split(".")[0]') -lt $NODE_MAJOR ]]; then
  log "Installing Node.js $NODE_MAJOR"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
fi
NODE_BIN=$(command -v node)
echo "Node.js $(node -v) at $NODE_BIN"

log "Creating user and folders"
id -u offcuts >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin offcuts
install -d -o offcuts -g offcuts -m 0750 "$DATA_DIR"
install -d -m 0755 "$APP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<ENV
# Offcuts settings. Restart after a change:  systemctl restart offcuts
PORT=3000
HOST=0.0.0.0
DATA_DIR=$DATA_DIR
NODE_ENV=production
# Proxies to trust for the client IP and HTTPS detection.
# The default trusts private networks. Set the proxy IP to be strict, for example 192.168.1.10
TRUST_PROXY="loopback, linklocal, uniquelocal"
# auto = Secure cookie when the proxy reports HTTPS. Use true if you only use HTTPS.
COOKIE_SECURE=auto
SESSION_DAYS=30
ENV
  chmod 0644 "$ENV_FILE"
fi

log "Building the app (this takes a minute)"
cd "$WORK"
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent
npm prune --omit=dev --no-audit --no-fund --loglevel=error

log "Installing the new version"
NEW="$APP_DIR/app.new"
rm -rf "$NEW"
mkdir -p "$NEW"
cp -a package.json node_modules build "$NEW"/
systemctl stop "$SERVICE" 2>/dev/null || true
rm -rf "$APP_DIR/app.old"
[[ -d "$APP_DIR/app" ]] && mv "$APP_DIR/app" "$APP_DIR/app.old"
mv "$NEW" "$APP_DIR/app"
chown -R root:root "$APP_DIR/app"
chmod -R u=rwX,go=rX "$APP_DIR/app"

cat > /etc/systemd/system/$SERVICE.service <<UNIT
[Unit]
Description=Offcuts snippet manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=offcuts
Group=offcuts
EnvironmentFile=$ENV_FILE
WorkingDirectory=$APP_DIR/app
ExecStart=$NODE_BIN build/server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

cat > /usr/local/bin/offcuts-cli <<CLI
#!/usr/bin/env bash
# Recovery commands: offcuts-cli reset-totp | reset-password <new> | reset-all
set -a; . $ENV_FILE; set +a
cd $APP_DIR/app
exec runuser -u offcuts -- $NODE_BIN build/server/cli.js "\$@"
CLI
chmod 0755 /usr/local/bin/offcuts-cli

systemctl daemon-reload
STARTED=$(date '+%Y-%m-%d %H:%M:%S')
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
sleep 3
systemctl is-active --quiet "$SERVICE" || { journalctl -u "$SERVICE" -n 30 --no-pager; exit 1; }

PORT=$(. "$ENV_FILE"; echo "$PORT")
IP=$(hostname -I | awk '{print $1}')
log "Offcuts is running at http://$IP:$PORT"
# The server prints a setup code only while no account exists.
CODE=$(journalctl -u "$SERVICE" --since "$STARTED" --no-pager -o cat | grep -ao 'setup code: [0-9]*' | tail -1 | cut -d' ' -f3 || true)
[[ -n "$CODE" ]] && echo "First-run setup code: $CODE"
exit 0
