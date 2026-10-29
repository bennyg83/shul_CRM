# GitHub Pages UI + API on the mini PC (Tailscale Funnel)

Use **GitHub Pages** for the static React app and the **mini PC** for the API and database. Users open the Pages URL in a normal browser — **no Tailscale client on their device**.

```
Browser  →  https://bennyg83.github.io/shul_CRM/              (UI from GitHub)
         →  https://crm-mini-1.<tailnet>.ts.net/api/…         (API from your PC, via Funnel)
```

GitHub does **not** proxy API traffic. The JavaScript downloaded from GitHub runs in the user’s browser and calls the API URL baked in at build time (`VITE_API_BASE_URL`). That API host must be reachable on the **public internet** (HTTPS). **Tailscale Serve** is tailnet-only; use **Tailscale Funnel** so anyone can reach the API while the machine stays on your tailnet for SSH/admin.

Same-origin Docker on the mini PC is still the default install; this split layout is optional.

## 1. Tailscale Funnel on the mini PC (public HTTPS API)

On **crm-mini** (Docker CRM listening on port 3000):

```powershell
# Public HTTPS → local CRM (requires Funnel allowed in Tailscale ACLs / admin console).
tailscale funnel --bg --yes 3000
tailscale funnel status
```

Check from a machine **without** Tailscale:

```powershell
curl.exe -s https://crm-mini-1.<your-tailnet>.ts.net/api/health
```

The GitHub Pages build uses this as the API base (no trailing slash after `api`):

`https://crm-mini-1.<tailnet>.ts.net/api`

To stop public exposure: `tailscale funnel reset` (or `--https=443 off`). For **tailnet-only** access again, use `tailscale serve` instead of Funnel.

**Security:** Funnel puts login and API on the internet. Rely on strong passwords, HTTPS, CORS (`ALLOWED_ORIGINS`), and rate limits. Consider Tailscale [node approval](https://tailscale.com/kb/1099/acl) and monitoring.

## 2. API `.env` on the mini PC

In `Newest_CRM_From_Power/.env` (or your compose env):

```env
HOST=0.0.0.0
TRUST_PROXY=1
COOKIE_SECURE=1
COOKIE_SAMESITE=none
ALLOWED_ORIGINS=https://bennyg83.github.io
PUBLIC_URL=https://bennyg83.github.io/shul_CRM
```

Restart the app container after changing env:

```powershell
docker --context desktop-linux compose up -d
```

| Setting | Purpose |
|---------|---------|
| `ALLOWED_ORIGINS` | CORS + write protection for the Pages origin (no path suffix) |
| `COOKIE_SAMESITE=none` | Session cookie sent from `github.io` to your API host |
| `COOKIE_SECURE=1` | Required with `SameSite=None` |
| `PUBLIC_URL` | Invitation / welcome links open on GitHub Pages |

## 3. GitHub repository

1. Push this monorepo to [github.com/bennyg83/shul_CRM](https://github.com/bennyg83/shul_CRM).
2. **Settings → Pages → Build and deployment:** Source = **GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables:**
   - `VITE_API_BASE_URL` = `https://crm-mini-1.<tailnet>.ts.net/api`
   - `VITE_BASE_PATH` = `/shul_CRM/` (only if the repo name differs)

Push to `master` (or run **Deploy GitHub Pages** manually). The site will be:

`https://bennyg83.github.io/shul_CRM/`

## 4. Local build (sanity check)

```bash
VITE_BASE_PATH=/shul_CRM/ \
VITE_API_BASE_URL=https://crm-mini-1.<tailnet>.ts.net/api \
npm run build -w @shulcrm/web
```

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Login succeeds then every request 401 | API not HTTPS, or `COOKIE_SAMESITE` / `COOKIE_SECURE` wrong |
| CORS error in browser | `ALLOWED_ORIGINS` must be exactly `https://bennyg83.github.io` |
| API unreachable from browser | Funnel not running, blocked by ACL, or Docker CRM down on the mini PC |
| Blank page / 404 on refresh | Ensure workflow copies `index.html` → `404.html` (already in `pages.yml`) |
| Logo missing | Public logo GET should work; if blocked, check Tailscale ACLs |

## 6. What not to do

- **Pages-only redirect** to `http://100.x.x.x:3000` does not give a stable *public* app; use Serve/Funnel HTTPS instead.
- Do not put secrets in `VITE_*` variables; they are embedded in the static JS bundle (only the public API URL belongs there).
