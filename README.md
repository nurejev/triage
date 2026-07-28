# Limon-IT M365 Triage (browser edition)

Free, browser-based incident response triage for Microsoft 365 - by
[Limon-IT](https://limon-it.nl). Live at **https://triage.limon-it.nl**.

Suspect a hacked account or BEC? Sign in, type the UPN, get a prioritized
findings report in seconds - then contain the account from the same screen.
Everything runs client-side: this is a static site, there is no backend, and no
data ever leaves the browser.

After sign-in there are two ways in, both driven by the same user search:

| | |
|---|---|
| **Triage** | Read-only investigation of one account → severity-ranked findings report. |
| **Containment** | The first-60-minutes response runbook, executed live against the tenant. |

Sister project of [ENCA](https://github.com/nurejev/enca) and built in the same
way: static SPA + MSAL (PKCE, no client secret) + a multi-tenant app
registration. Sign-in requests **read-only delegated** Graph permissions;
containment asks for its write scopes separately and only when armed. Detection
logic is inspired by our PowerShell analyzer for the open-source
[Microsoft-Extractor-Suite](https://github.com/invictus-ir/Microsoft-Extractor-Suite);
the containment runbook follows Tiago S. Carvalho's
[Microsoft 365 IR runbook: first 60 minutes](https://www.tiagoscarvalho.com/security-compliance/microsoft-365-incident-response-first-60-minutes-compromised-account-2026).

## What it checks per user

Sign-in logs (unexpected countries, brute force followed by success, impossible
travel, legacy authentication, Identity Protection risk), the Unified Audit Log
via the async Graph audit query API (inbox rules, mailbox forwarding, OAuth
consents, role changes, mailbox searches, mass downloads), OAuth permission
grants with risky-scope scoring, registered MFA methods, risky user state and
risk detections, directory audit events, and account hygiene (password age).
Each finding comes with a severity and a recommended action; findings and raw
evidence export as CSV/JSON.

See [COVERAGE.md](COVERAGE.md) for exactly what is checked versus the Microsoft-Extractor-Suite.

## Containment

Opens on whatever account the search selected, and carries the triage findings
across so the steps your report flagged are marked. The order is deliberate -
revoking sessions *before* the password reset, so a stolen access token cannot
be used to add a recovery method and walk back in through the reset.

1. **Preserve evidence** - export before you destroy artefacts.
2. **Revoke sign-in sessions** - `POST /users/{id}/revokeSignInSessions`.
3. **Disable the account** - `PATCH accountEnabled:false` (disable, never delete).
4. **Reset the password** - 20 chars from `crypto.getRandomValues`, shown once, force change at next sign-in.
5. **Authentication methods** - listed inline, removed per item (phone, Authenticator, FIDO2, TAP, software OATH, email, WHfB).
6. **Inbox rules, forwarding, delegates** - copy-ready Exchange Online PowerShell; delegated Graph cannot reach another user's mailbox.
7. **OAuth grants** - listed with risky-scope highlighting and a tenant-wide-consent warning, revoked per grant.

Then the fifteen **blast-radius** checks, the **evidence-preservation** list and
the **communication** pattern as checklists, and a timestamped **action log**
that exports as CSV or as a Markdown handover report.

Guard rails: write scopes are requested only when the analyst presses *Arm
containment*, every mutating action goes through one confirmation dialog naming
the tenant, actions route through a single `gwrite()` helper, and the whole
elevation is dropped on sign-out or refresh along with the rest of the session.
Deploy read-only with `create-appreg.ps1 -ReadOnly` if you never want the option.

## Run it in Docker

The whole tool runs from GitHub in a container - after the one-time admin
consent, anyone on the team can spin it up anywhere:

```bash
# straight from the published image (built from GitHub by Actions)
docker run --rm -p 8080:80 ghcr.io/nurejev/triage:latest

# or build directly from the GitHub repo, no checkout needed
docker build -t m365-triage https://github.com/nurejev/triage.git
docker run --rm -p 8080:80 m365-triage

# or with compose from a checkout
docker compose up -d
```

Open **http://localhost:8080** - that redirect URI is registered on the app
registration, so sign-in, consent, triage and containment all work exactly as
on the hosted site. On every start the container pulls the latest `main` from
GitHub and serves that (baked-in copy as offline fallback); set `GIT_SYNC=off`
to pin to the image, or `GIT_REPO`/`GIT_REF` to serve a fork or branch.
Self-hosting under a different origin? Add that origin as a SPA redirect URI
on the app registration first. nginx ships a strict Content-Security-Policy
(connect-src limited to `graph.microsoft.com` and `login.microsoftonline.com`),
so even injected script could not send data anywhere else.

### Optional: the Exchange containment backend

Microsoft does not let a browser change another user's inbox rules, mailbox
forwarding or delegates. Deploy this small service and those become buttons in
the containment runbook instead of copy-paste PowerShell:

```powershell
./create-backend-appreg.ps1 -SpaAppId 8f1b5185-e782-4dc3-8aee-92ba4616c8d0 `
    -Organization contoso.onmicrosoft.com
# follow the printed steps (admin consent + Exchange RBAC), then:
docker compose --profile backend up -d
```

The script writes `backend.env` (for the backend container) and `.env` (which
`docker compose` reads by itself), so there is no environment variable to
export - the command above is identical in PowerShell, bash and zsh. Both files
and the whole `certs/` directory are gitignored; do not commit them.

It is the only component in the whole tool that holds a standing credential -
a certificate, never a secret. It performs exactly seven mailbox operations,
and only after verifying that the request carries a Microsoft-signed token
minted for *this* service, issued to the Triage SPA, belonging to a real
signed-in user whose directory roles it re-checks with Microsoft on every
request. Everything is written to an append-only audit log. It runs
unprivileged, read-only, with no published port.

**Read [SECURITY.md](SECURITY.md)** before deploying it - it explains the whole
trust model, what an attacker would actually have to do, and how to narrow the
Exchange permission with RBAC for Applications instead of handing out the
Exchange Administrator role. Skip the backend entirely and the tool holds no
standing credential at all.

### The PowerShell companion

For the full extraction (and for the mailbox step if you skip the backend)
there is a container with
ExchangeOnlineManagement, Microsoft.Graph and the Microsoft-Extractor-Suite
preinstalled:

```bash
docker run --rm -it -v "$PWD/evidence:/evidence" ghcr.io/nurejev/triage-pwsh:latest
# or: docker compose run --rm pwsh
```

It prints a cheat sheet on start; sign in with device code
(`Connect-ExchangeOnline -Device`, `Connect-MgGraph -UseDeviceCode`).
Extraction output written to `/evidence` lands in `./evidence` on the host,
ready to load back into the web app via *View extraction output*.

All three images are rebuilt and pushed to GHCR by `.github/workflows/docker.yml`
on every push to `main` (make the packages public once for anonymous pulls).

## Deploy your own instance

1. **App registration** - run `create-appreg.ps1` (or create manually: single
   app, *Accounts in any organizational directory*, platform **SPA** with
   redirect URIs `https://triage.limon-it.nl` and `http://localhost:8080`,
   delegated Graph permissions as listed in `js/authConfig.js`). Paste the
   client ID into `js/authConfig.js`.
2. **GitHub Pages** - push this repo, enable Pages (GitHub Actions source; the
   included `deploy.yml` workflow publishes on every push to `main`).
3. **DNS** - CNAME record `triage` → `<user>.github.io` at your registrar. The
   `CNAME` file in this repo pins the custom domain; enable *Enforce HTTPS*.
4. **Admin consent** - each customer tenant consents once via
   `https://login.microsoftonline.com/organizations/adminconsent?client_id=<CLIENT_ID>&redirect_uri=https://triage.limon-it.nl`.
   Remove access any time by deleting the enterprise application
   "Limon-IT M365 Triage" in the customer's Entra portal. For a look-but-do-not-touch
   deployment run `create-appreg.ps1 -ReadOnly`, which registers the triage scopes
   only and leaves containment unable to arm.

### Local development

```bash
python3 -m http.server 8080
# open http://localhost:8080 - use "Try the demo" (no sign-in needed)
```

### Releasing a new build

```bash
python3 bump.py "Added risky-app timeline" "Fixed dark mode contrast"
git commit -am "build 2" && git push
```

`bump.py` increments the build number shown in the footer, adds the notes to
the **What's new** page, and refreshes the `?v=` cache-busters. The deploy
workflow prints the build number it ships.

## Permissions & privacy

| Scope | Why |
|---|---|
| User.Read.All | UPN search & user profile |
| AuditLog.Read.All | sign-in logs, directory audits |
| Directory.Read.All | resolve apps/roles |
| Policy.Read.All | Conditional Access context |
| IdentityRiskyUser.Read.All / IdentityRiskEvent.Read.All | Identity Protection |
| UserAuthenticationMethod.Read.All | registered MFA methods |
| AuditLogsQuery.Read.All | Unified Audit Log (async query API) |

Requested at sign-in, all delegated and all read-only. Admin consent once per
tenant.

Containment scopes - **never requested at sign-in**, only when an analyst arms
the containment screen:

| Scope | Why |
|---|---|
| User.RevokeSessions.All | revoke refresh tokens |
| User.ReadWrite.All | disable the account, reset the password |
| User-PasswordProfile.ReadWrite.All | password reset in tenants that split this out |
| UserAuthenticationMethod.ReadWrite.All | remove attacker-added MFA methods |
| DelegatedPermissionGrant.ReadWrite.All | revoke OAuth consent grants |

Using them also needs the matching Entra roles - typically some combination of
User Administrator, Authentication Administrator or Privileged Authentication
Administrator, and Application or Cloud Application Administrator. Validate
least privilege against Microsoft Learn before making this a formal procedure.

The site is static; there are no cookies, no analytics, no server-side
processing. Findings are indicators, not verdicts - verify before acting.

## License

MIT (see LICENSE.txt). © Limon-IT.
