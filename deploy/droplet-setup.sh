#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 24.04 DigitalOcean droplet. Run as root.
# Usage: HOSTNAME=omega.example.com bash droplet-setup.sh
set -euo pipefail
: "${HOSTNAME:?set HOSTNAME=your.host.name}"

apt-get update
apt-get install -y curl git sqlite3 ca-certificates debian-keyring debian-archive-keyring apt-transport-https

# Node 24 LTS (node:sqlite is release-candidate quality there; Node 22.12+ also works)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
corepack enable && corepack prepare pnpm@10.33.0 --activate

# Caddy (TLS + reverse proxy)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# Service user + dirs
id -u omega >/dev/null 2>&1 || useradd --system --home /srv/omega --shell /usr/sbin/nologin omega
mkdir -p /srv/omega /var/lib/omega /etc/omega /var/backups/omega
chown -R omega:omega /srv/omega /var/lib/omega /var/backups/omega

# Tokens (keep these; the app and the coach need them)
if [ ! -f /etc/omega/env ]; then
  cat > /etc/omega/env <<ENV
OMEGA_TOKEN_WRITE=$(openssl rand -hex 32)
OMEGA_TOKEN_READ=$(openssl rand -hex 32)
OMEGA_DB_PATH=/var/lib/omega/omega.db
OMEGA_STATIC_DIR=/srv/omega/apps/web/dist
PORT=8787
NODE_ENV=production
ENV
  chmod 600 /etc/omega/env
fi

# Code
if [ ! -d /srv/omega/.git ]; then
  sudo -u omega git clone https://github.com/vide-ad/omega.git /srv/omega
fi

# Caddy
sed "s/omega.example.com/${HOSTNAME}/" /srv/omega/deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

# systemd
cp /srv/omega/deploy/omega-api.service /etc/systemd/system/
cp /srv/omega/deploy/omega-backup.service /srv/omega/deploy/omega-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable omega-api omega-backup.timer

echo "Setup done. Now run: bash /srv/omega/deploy/deploy.sh"
echo "Tokens are in /etc/omega/env"
