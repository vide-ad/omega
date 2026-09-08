# Deploy runbook (DigitalOcean droplet)

Target: one Ubuntu 24.04 droplet, one Node process serving the API **and** the built PWA on `127.0.0.1:8787`,
Caddy in front for HTTPS. SQLite file at `/var/lib/omega/omega.db`. Nightly backups to `/var/backups/omega`.

## 0. Hostname. Free, and no purchase needed.

**Corrected 8 September.** An earlier version of this page said to buy a domain and to avoid sslip.io. David
pointed out that North does not have a bought domain, and he is right. North serves
`mcp.161-35-46-101.sslip.io` on this droplet behind Caddy with a working certificate. sslip.io resolves any
name of the form `<ip-with-dashes>.sslip.io` to that IP, for free, with no account. Evidence from his own box
beats the general caveat I had read, so **use the same pattern**:

```
omega.161-35-46-101.sslip.io      # substitute the droplet's real IP
```

Something is still needed, and it is not nothing. Both clients reach the API over HTTPS, and a browser will
only trust HTTPS on a name, not a bare IP. sslip.io supplies the name. So the requirement is real and the cost
is zero.

**The one caveat, and who it applies to.** An sslip.io name contains the droplet's IP, so if the IP ever
changes the name changes with it. For North that is harmless, because its MCP endpoint holds no local state.
For the interim PWA it would mean re-installing from the Home Screen and losing anything not yet synced. For
the Flutter app it is harmless again, since you just point it at a new URL. A bought domain removes that risk
for about 10 pounds a year and is worth it only if the droplet's IP is likely to move.

## 0b. This droplet may already run other apps

North runs on this box. Omega must not disturb it.

`droplet-setup.sh` installs Omega's vhost as a drop-in at `/etc/caddy/sites/omega.caddy` and only ever appends
the `import /etc/caddy/sites/*.caddy` line to the main Caddyfile if it is missing. It never overwrites
`/etc/caddy/Caddyfile`, and it runs `caddy validate` before reloading rather than restarting.

An earlier version of the script did overwrite the main Caddyfile. On this droplet that single line would have
taken down North's api, app, staging-api and mcp together. That is the same mistake corvus caught and blocked
when court-watch's install brief tried it, and the reason the import directory exists at all. Fixed on
8 September. If you write another deploy script for this box, follow the drop-in pattern.

Omega also needs its own system user, its own port and its own data directory, all of which the setup script
already does (`omega`, `127.0.0.1:8787`, `/var/lib/omega`).

## 1. First-time setup

```bash
ssh root@<droplet-ip>
curl -fsSL https://raw.githubusercontent.com/vide-ad/omega/main/deploy/droplet-setup.sh -o setup.sh
OMEGA_HOST=omega.161-35-46-101.sslip.io bash setup.sh
bash /srv/omega/deploy/deploy.sh --start=2026-09-12   # the Saturday the first block starts
cat /etc/omega/env                                     # copy OMEGA_TOKEN_WRITE (phone) and OMEGA_TOKEN_READ (coach)
```

Then on the phone: open `https://omega.161-35-46-101.sslip.io`, Settings → paste the write token → Test connection →
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
| Coach smoke test | `curl -H "Authorization: Bearer $OMEGA_TOKEN_READ" https://omega.161-35-46-101.sslip.io/api/v1/summary?weeks=4` |

## 4. Local development

```bash
pnpm install
pnpm --filter @omega/core build
cp apps/api/.env.example apps/api/.env      # set tokens
pnpm --filter @omega/api migrate && pnpm --filter @omega/api seed -- --start=2026-09-12
pnpm dev:api                                # http://localhost:8787
pnpm dev:web                                # http://localhost:5173 (proxies /api)
```
