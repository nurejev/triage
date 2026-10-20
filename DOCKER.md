# Running M365 Triage in Docker — what self-hosting gets you

The web app is a static site; you never *need* Docker to use it. What the
container adds is a **strict Content-Security-Policy**, a **same-origin `/api`
path** for the optional Exchange backend, and a way to hand the whole tool to
a colleague as one command. This page maps out every way the three images can
be combined, and what each combination can and cannot do.

---

## The three images

All three are built by `.github/workflows/docker.yml` on every push to `main`
and published to GHCR (make the packages public once for anonymous pulls).

| Image | What it is | Needed? |
|---|---|---|
| `ghcr.io/nurejev/triage` | nginx serving the SPA, with the strict CSP and the `/api` proxy | No — the hosted site works too |
| `ghcr.io/nurejev/triage-backend` | Exchange containment backend (Node + PowerShell, holds a certificate) | No — without it the mailbox step is copy-paste PowerShell |
| `ghcr.io/nurejev/triage-pwsh` | PowerShell with ExchangeOnlineManagement, Microsoft.Graph and Microsoft-Extractor-Suite preinstalled | No — a convenience for full extraction |

---

## Four deployment shapes

### 1. Web only — one command, no state

```bash
docker run --rm -p 8080:80 ghcr.io/nurejev/triage:latest
```

Open <http://localhost:8080>. That redirect URI is registered on the app
registration, so sign-in, consent, triage and Graph containment all work
exactly as on `triage.limon-it.nl`.

Holds **no credential of any kind**. The container is a web server; the
analyst's delegated token lives in one browser tab and dies with it.

### 2. Web + Exchange backend — mailbox steps become buttons

```powershell
./create-backend-appreg.ps1 -SpaAppId 8f1b5185-e782-4dc3-8aee-92ba4616c8d0 `
    -Organization contoso.onmicrosoft.com
# follow the printed steps (admin consent + Exchange RBAC), then:
docker compose --profile backend up -d
```

Inbox rules, forwarding and delegates are the one thing a browser cannot fix —
Microsoft only allows changing *another user's* mailbox settings through
Exchange PowerShell or app-only permissions. The backend closes that gap for
exactly seven operations. **This is the only component in the whole tool that
holds a standing credential.** Read [SECURITY.md](SECURITY.md) before deploying
it.

### 3. Web + PowerShell companion — full extraction alongside the triage report

```bash
docker compose run --rm pwsh
# or standalone:
docker run --rm -it -v "$PWD/evidence:/evidence" ghcr.io/nurejev/triage-pwsh:latest
```

Lands you in `pwsh` with the modules loaded and a cheat sheet printed. No
browser in the container, so sign in with a device code. Output written to
`/evidence` appears in `./evidence` on the host, ready to load back into the
web app via *View extraction output*.

### 4. All three

```bash
docker compose --profile backend up -d
docker compose run --rm pwsh
```

`pwsh` is behind the `extract` profile, so a plain `up` never starts it; use
`run --rm` when you want it.

---

## Live-from-GitHub vs. pinned

This is the interesting property of the web image, and it is a deliberate
trade-off.

On **every container start** the entrypoint shallow-clones `main` from GitHub
and serves that, falling back to the copy baked into the image if the clone
fails (offline, rate-limited). So a container started this morning serves this
morning's build without anyone pulling a new image.

| Variable | Default | Effect |
|---|---|---|
| `GIT_SYNC` | `on` | `off` serves only the baked-in copy — fully offline, and pins the code you reviewed |
| `GIT_REPO` | this repo | Serve a fork instead |
| `GIT_REF` | `main` | Serve a branch or tag — e.g. `GIT_REF=beta` for a test build |

```bash
# always-current (default)
docker run --rm -p 8080:80 ghcr.io/nurejev/triage:latest

# pinned and offline
docker run --rm -p 8080:80 -e GIT_SYNC=off ghcr.io/nurejev/triage:latest

# serve a branch from a fork
docker run --rm -p 8080:80 \
  -e GIT_REPO=https://github.com/you/triage.git -e GIT_REF=my-branch \
  ghcr.io/nurejev/triage:latest
```

`GIT_SYNC=off` is the right answer in a regulated environment: the residual
risk in this design is that the browser runs whatever JavaScript the host
serves, and that JavaScript holds a delegated token. Pinning means you run the
code you reviewed. The startup log prints the build number it is serving.

Building straight from GitHub needs no checkout at all:

```bash
docker build -t m365-triage https://github.com/nurejev/triage.git
docker run --rm -p 8080:80 m365-triage
```

---

## What the container adds over `python3 -m http.server`

**A strict Content-Security-Policy.** nginx sends
`connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com`,
plus `script-src 'self'`, `object-src 'none'`, `frame-src` limited to the
Microsoft login host, `X-Frame-Options: DENY`, `nosniff` and
`Referrer-Policy: no-referrer`. Even injected script could not send evidence to
a third destination — the browser blocks it before the request leaves. If a
future feature breaks under it, loosen `connect-src` in `docker/nginx.conf`
rather than deleting the header.

**A same-origin `/api` path.** The backend is proxied under the same origin, so
there is no CORS surface and the CSP stays tight. The proxy resolves the
backend hostname *at request time*, so nginx starts fine when no backend is
deployed — the SPA then reports "no backend" and the mailbox step falls back to
PowerShell.

**Runtime config without a rebuild.** The entrypoint writes `js/config.js` from
environment variables at start (after the git pull, so it survives the refresh).
Only public values ever go in it:

| Variable | Purpose |
|---|---|
| `BACKEND_APP_ID` | Application ID of the Exchange backend. Empty = no backend, and the SPA says so |
| `BACKEND_BASE` | Where the SPA calls the backend (default `/api`) |
| `TRIAGE_BACKEND_HOST` | Which host nginx proxies `/api` to (default `backend`, the compose service name) |

**Correct caching.** `?v=N` assets cache; `index.html` does not.

---

## Self-hosting under a different origin

Anything other than `http://localhost:8080` (a reverse proxy, an internal
hostname, a different port) needs that origin added as a **SPA redirect URI** on
the app registration first, or MSAL sign-in will fail. Publish the container on
whatever port you like and put your own TLS terminator in front; keep the CSP
headers if you replace nginx.

---

## The backend's security posture, in short

Worth knowing before you decide whether to run shape 2 or 3. Full detail is in
[SECURITY.md](SECURITY.md).

- **Seven operations only**, all against one named mailbox: `rules-list`,
  `rules-disable`, `rules-remove`, `forwarding-get`, `forwarding-clear`,
  `delegates-list`, `delegates-remove`. It cannot read or send mail, create
  rules, touch Entra, or run arbitrary PowerShell — the action comes from a
  `ValidateSet` allowlist and arguments are never interpolated into a command
  string.
- **Five checks on every request**: Microsoft signature, audience
  (`api://<backend-app-id>`), client (the Triage SPA specifically), a real
  delegated human, and that human's *current* directory roles re-checked with
  Microsoft on-behalf-of. It never grants a capability the caller did not
  already have.
- **A certificate, not a secret** — a signed client assertion, mounted
  read-only at `/certs`.
- **Container hardening** is in the compose file already: unprivileged UID
  10001, `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs for
  `/tmp` and `/home/triage`, a healthcheck, and **no published port** — only
  nginx on the internal Docker network can reach it.
- **Zero npm dependencies.** The API is one standard-library Node file, so the
  supply chain to audit is `backend/server.js` plus two Microsoft base images.

Tuning knobs (all optional, set in `backend.env`):

| Variable | Default | Purpose |
|---|---|---|
| `TENANT_ID` | — | Fixed at start; a token from any other tenant is rejected. One backend per tenant, deliberately |
| `ORGANIZATION` | — | The Exchange organisation to connect to |
| `BACKEND_APP_ID` / `SPA_APP_ID` | — | The two app registrations |
| `API_SCOPE` | `Contain.Exchange` | Scope the token must carry |
| `REQUIRED_ROLES` | GA, Exchange Admin, Security Admin, Privileged Role Admin | Narrow this to the smallest set your responders actually hold |
| `PROTECTED_UPNS` | empty | Mailboxes the backend refuses to touch regardless of caller — put break-glass accounts here |
| `RATE_PER_MINUTE` | 30 | Per-caller rate limit |
| `MAX_CONCURRENT` | 2 | Concurrent PowerShell operations |
| `PWSH_TIMEOUT_MS` | 120000 | PowerShell operation timeout |
| `AUDIT_FILE` | `/var/log/triage/audit.jsonl` | Append-only audit log |
| `CERT_PEM` / `KEY_PEM` / `CERT_PFX` / `CERT_PFX_PASSWORD` | under `/certs` | The certificate |

Every request — allowed or denied — is one JSON line in `./audit/audit.jsonl`
(also echoed to `docker logs`), recording caller UPN and object ID, the roles
that authorised them, route, target mailbox, outcome and duration. Never tokens
or mailbox content. Ship it to your SIEM and alert on `action.change`.

---

## Volumes and files on the host

| Path | Written by | Contents |
|---|---|---|
| `./certs/` | `create-backend-appreg.ps1` | `backend.crt`, `backend.key`, `backend.pfx` — mounted read-only. **Gitignored; never commit** |
| `./audit/` | backend | `audit.jsonl` |
| `./evidence/` | pwsh companion | Extraction output, loadable back into the web app |
| `backend.env` | `create-backend-appreg.ps1` | Backend config incl. the `.pfx` password. **Gitignored** |
| `.env` | `create-backend-appreg.ps1` | `BACKEND_APP_ID`, read automatically by `docker compose` — so no variable to export, and the commands are identical in PowerShell, bash and zsh |

Treat the Docker host as a Tier-0 admin workstation when the backend runs on
it: that certificate is equivalent to standing Exchange recipient-management
rights.

---

## Getting a container runtime

- **macOS** — [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  (`brew install --cask docker`, then launch the app once — the `docker`
  command only appears after the app has run) or the lighter
  [OrbStack](https://orbstack.dev) (`brew install --cask orbstack`).
- **Windows** — Docker Desktop with the WSL2 backend.
- **Linux** — `docker.io` plus `docker-compose-plugin` from your distribution.

Check it works: `docker run --rm hello-world`.

---

## Choosing a shape

| You want | Run |
|---|---|
| Triage and Graph containment, nothing installed, nothing stored | The hosted site, or shape 1 |
| The same, but pinned and offline | Shape 1 with `GIT_SYNC=off` |
| Test a branch before it ships | Shape 1 with `GIT_REF=<branch>` |
| Inbox rules / forwarding / delegates as buttons instead of PowerShell | Shape 2 — read SECURITY.md first |
| Full Extractor-Suite extraction alongside the report | Shape 3 |
| Look-but-do-not-touch: containment cannot even arm | Any shape, with an app registration created by `create-appreg.ps1 -ReadOnly` |

Skip the backend and the tool holds **no standing credential at all**.
