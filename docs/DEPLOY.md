# Deploy runbook (DigitalOcean droplet)

Target: one Ubuntu 24.04 droplet, one Node process serving the API **and** the built PWA on `127.0.0.1:8787`,
Caddy in front for HTTPS. SQLite file at `/var/lib/omega/omega.db`. Nightly backups to `/var/backups/omega`.

## 0. Hostname (do this first)

An installed iOS PWA needs a real HTTPS origin, and the origin cannot change later without re-installing the
Home Screen app and losing its local data. Options:
- **Buy a domain** (~$10/yr) and point an A record at the droplet — recommended.
- **DuckDNS** subdomain (free) — acceptable.
- Avoid sslip.io / nip.io (rate-limited certificate issuance).

## 1. First-time setup

```bash
ssh root@<droplet-ip>
curl -fsSL https://raw.githubusercontent.com/vide-ad/omega/main/deploy/droplet-setup.sh -o setup.sh
HOSTNAME=omega.example.com bash setup.sh
bash /srv/omega/deploy/deploy.sh --start=2026-09-12   # the Saturday the first block starts
cat /etc/omega/env                                     # copy OMEGA_TOKEN_WRITE (phone) and OMEGA_TOKEN_READ (coach)
```

Then on the phone: open `https://omega.example.com`, Settings → paste the write token → Test connection →
Share → Add to Home Screen.

## 2. Every deploy

```bash
ssh root@<droplet-ip> bash /srv/omega/deploy/deploy.sh
```

## 3. Operations

| Task | Command |
|---|---|
| Logs | `journalctl -u omega-api -f` |
| Restart | `systemctl restart omega-api` |
| Manual backup | `sqlite3 /var/lib/omega/omega.db ".backup /var/backups/omega/manual.db"` |
| Restore | stop service → copy backup over `/var/lib/omega/omega.db` → start service |
| Rotate tokens | edit `/etc/omega/env` → `systemctl restart omega-api` → update the phone + coach |
| Coach smoke test | `curl -H "Authorization: Bearer $OMEGA_TOKEN_READ" https://omega.example.com/api/v1/summary?weeks=4` |

## 4. Local development

```bash
pnpm install
pnpm --filter @omega/core build
cp apps/api/.env.example apps/api/.env      # set tokens
pnpm --filter @omega/api migrate && pnpm --filter @omega/api seed -- --start=2026-09-12
pnpm dev:api                                # http://localhost:8787
pnpm dev:web                                # http://localhost:5173 (proxies /api)
```
