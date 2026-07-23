# Limon-IT M365 Triage (browser edition)

Free, browser-based incident response triage for Microsoft 365 - by
[Limon-IT](https://limon-it.nl). Live at **https://triage.limon-it.nl**.

Suspect a hacked account or BEC? Sign in, type the UPN, get a prioritized
findings report in seconds. Everything runs client-side: this is a static site,
there is no backend, and no data ever leaves the browser.

Sister project of [ENCA](https://github.com/nurejev/enca) and built in the same
way: static SPA + MSAL (PKCE, no client secret) + a multi-tenant app
registration with **read-only delegated** Graph permissions. Detection logic is
inspired by our PowerShell analyzer for the open-source
[Microsoft-Extractor-Suite](https://github.com/invictus-ir/Microsoft-Extractor-Suite).

## What it checks per user

Sign-in logs (unexpected countries, brute force followed by success, impossible
travel, legacy authentication, Identity Protection risk), the Unified Audit Log
via the async Graph audit query API (inbox rules, mailbox forwarding, OAuth
consents, role changes, mailbox searches, mass downloads), OAuth permission
grants with risky-scope scoring, registered MFA methods, risky user state and
risk detections, directory audit events, and account hygiene (password age).
Each finding comes with a severity and a recommended action; findings and raw
evidence export as CSV/JSON.

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
   All scopes are read-only; remove access any time by deleting the enterprise
   application "Limon-IT M365 Triage" in the customer's Entra portal.

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

All delegated, all read-only, admin consent required once per tenant. The site
is static; there are no cookies, no analytics, no server-side processing.
Findings are indicators, not verdicts - verify before acting.

## License

MIT (see LICENSE.txt). © Limon-IT.
