# GitHub Pages UI + Tailscale API (mini PC)

Use a **stable public URL** for the React app on GitHub Pages, with the **API and database** staying on the mini PC over **Tailscale HTTPS**.

```
Browser  →  https://bennyg83.github.io/shul_CRM/     (static UI)
         →  https://crm-mini-1.<tailnet>.ts.net/api/…  (session cookie, data)
```

Same-origin Docker deploy is still the default; this path is optional.

## 1. Tailscale HTTPS on the mini PC

On **crm-mini** (with Docker CRM on port 3000):

```powershell
# One-time: expose local CRM over HTTPS on your tailnet (MagicDNS name).
tailscale serve --bg --https=443 http://127.0.0.1:3000
```

Check:

```powershell
curl.exe -s https://crm-mini-1.<your-tailnet>.ts.net/api/health
```

Note the hostname (Admin console → Machines → **crm-mini-1**). The API base for the web build is:

`https://crm-mini-1.<tailnet>.ts.net/api`

**Tailnet only:** users must be signed into Tailscale to reach that host. For a **public** API URL, use [Tailscale Funnel](https://tailscale.com/kb/1311/tailscale-funnel) instead of Serve (understand the security impact).

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
| API unreachable from browser | Tailscale not connected, Serve not running, or Funnel not enabled for public users |
| Blank page / 404 on refresh | Ensure workflow copies `index.html` → `404.html` (already in `pages.yml`) |
| Logo missing | Public logo GET should work; if blocked, check Tailscale ACLs |

## 6. What not to do

- **Pages-only redirect** to `http://100.x.x.x:3000` does not give a stable *public* app; use Serve/Funnel HTTPS instead.
- Do not put secrets in `VITE_*` variables; they are embedded in the static JS bundle (only the public API URL belongs there).
