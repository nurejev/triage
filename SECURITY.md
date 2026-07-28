# Security of Limon-IT M365 Triage

This document explains, in plain language, what this tool can touch, who can
make it touch anything, where the credentials live, and what an attacker would
have to do to abuse it. It is written to be read by someone deciding whether to
consent to it in their tenant.

If you read nothing else, read [The one-paragraph version](#the-one-paragraph-version)
and [What an attacker would have to do](#what-an-attacker-would-have-to-do).

---

## The one-paragraph version

The tool has three parts. **Triage** runs entirely in your browser with
read-only permissions and can change nothing. **Containment** runs in the same
browser tab but asks for write permissions at the moment you press *Arm
containment*, and every change it makes is a delegated action — Microsoft sees
it as *you* doing it, and you can only do what your own account is already
allowed to do. The optional **Exchange backend** is the only component that
holds a standing credential; it exists because Microsoft does not let a browser
change another person's inbox rules. It performs exactly seven mailbox
operations, only after verifying cryptographically that the request came from
this app, from a signed-in human, whose directory roles it re-checks with
Microsoft on every request. Everything it does is written to an append-only
audit log. Deploy without the backend and the tool holds no standing credential
at all.

---

## The three trust levels

| | Where it runs | Credential | Can it change your tenant? |
|---|---|---|---|
| **Triage** | Your browser | Your delegated sign-in, read-only scopes | No. Not even in principle — the scopes are read-only. |
| **Containment (Graph)** | Your browser | Your delegated sign-in, write scopes, requested only when you arm it | Yes, as you, within your own permissions. |
| **Exchange backend** | Your Docker host | Its own certificate + app-only Exchange permission | Yes, but only the seven listed operations, only for an authorised caller. |

The first two ship as a static website: no server, no database, no cookies, no
analytics, no telemetry. Evidence lives in JavaScript memory in one browser tab
and is gone when the tab closes. The only thing ever written to persistent
browser storage is a single integer recording which release notes you have
already seen.

---

## Part 1 — Triage (read-only)

**Permissions requested at sign-in.** All delegated, all read-only:
`User.Read.All`, `AuditLog.Read.All`, `Directory.Read.All`, `Policy.Read.All`,
`IdentityRiskyUser.Read.All`, `IdentityRiskEvent.Read.All`,
`UserAuthenticationMethod.Read.All`, `AuditLogsQuery.Read.All`.

**Delegated means scoped to you.** A delegated token acts as the signed-in
user. Microsoft — not this tool — decides what comes back. An analyst signed
into tenant A cannot read tenant B, no matter what the code asks for. There is
no shared store where one customer's results could leak into another's,
because there is no store at all.

**Where the data goes.** Browser → `graph.microsoft.com` directly. Sign-in
goes browser → `login.microsoftonline.com`. Nothing is sent to Limon-IT. The
Docker image serves a Content-Security-Policy that limits `connect-src` to
exactly those two Microsoft hosts, so even injected JavaScript could not
exfiltrate to a third destination — the browser blocks it before the request
leaves.

**Session hygiene.** MSAL tokens live in `sessionStorage` (per tab). A page
refresh deliberately drops the session and returns to the sign-in screen rather
than silently restoring it. Tokens expire in about an hour and nothing runs
when the tab is closed.

---

## Part 2 — Containment (delegated write)

**Nothing is requested at sign-in.** The write scopes are asked for only when
you press *Arm containment*. A tenant that only ever wants triage never
consents to them, and the consent prompt is the moment you notice something is
about to change.

**The scopes**, and what each one is for:

| Scope | Used by |
|---|---|
| `User.RevokeSessions.All` | Revoke sign-in sessions |
| `User.ReadWrite.All` | Disable the account, reset the password |
| `User-PasswordProfile.ReadWrite.All` | Password reset in tenants that split this permission out |
| `UserAuthenticationMethod.ReadWrite.All` | Remove attacker-added MFA methods |
| `DelegatedPermissionGrant.ReadWrite.All` | Revoke OAuth consent grants |

**Consent is not the same as capability.** Even with these scopes, Microsoft
still enforces your directory role. An analyst without, say, Authentication
Administrator gets a 403 from Graph when trying to remove an authentication
method. The tool cannot elevate anyone.

**Structural guard rails in the code:**

- Every mutating call goes through a single helper, `TriageGraph.gwrite()`. There is one place to audit, and read-only code paths physically cannot write.
- Every destructive action opens a confirmation dialog that names the account and the tenant before anything happens.
- Actions are ordered so nothing leaks: sessions are revoked *before* the password reset, so a stolen access token cannot be used to add a recovery method and walk back in through the reset you just performed.
- The elevation dies with the session — sign out, close the tab or refresh and the write scopes are gone.
- Every action and every checklist tick lands in a timestamped action log, exportable as CSV or a Markdown handover report.

**The temporary password** is generated in your browser with
`crypto.getRandomValues`, shown once, never stored, and sent only to Microsoft
Graph over TLS.

---

## Part 3 — The Exchange backend (the only standing credential)

### Why it exists

Inbox rules, mailbox forwarding and mailbox delegates are the most common
persistence artefacts in a business email compromise — and the one thing a
browser cannot fix. Microsoft only permits changing *another user's* mailbox
settings through Exchange Online PowerShell or app-only permissions, and
app-only means a credential that could never be hidden in a public
single-page app. So it lives in a container you run, not in the browser.

**You do not have to deploy it.** Without it, everything else works and that
one step gives you prefilled PowerShell instead of buttons. The tool tells you
plainly, on the containment screen, which mode you are in.

### What it can do — the complete list

Seven operations, all against one named mailbox:

`rules-list`, `rules-disable`, `rules-remove`, `forwarding-get`,
`forwarding-clear`, `delegates-list`, `delegates-remove`.

It cannot read mail. It cannot send mail. It cannot create rules, create users,
change passwords, touch Entra, or run arbitrary PowerShell. The action is
selected from a fixed allowlist (`ValidateSet` in `exo.ps1`), arguments are
passed as named parameters and never interpolated into a command string, and
the mailbox address is validated against a strict pattern before it gets
anywhere near Exchange.

### How a request is authorised

Five checks, in order, on every single request:

1. **Signature.** The bearer token is verified against Microsoft's published signing keys (RS256, key fetched from your tenant's JWKS endpoint). An unknown key ID is a rejection, never a bypass.
2. **Audience.** The token must have been minted *for this backend*
   (`api://<backend-app-id>`, scope `Contain.Exchange`). A Microsoft Graph token replayed at the backend is refused — and the backend's own token is useless against Graph.
3. **Client.** The token's `azp`/`appid` must be the Triage SPA. Entra additionally only issues tokens for this API to that one pre-authorized application, so an attacker's own app registration cannot request them in the first place.
4. **Human.** The token must be delegated, with a user object ID and UPN. App-only tokens are refused; there is no machine-to-machine path in.
5. **Role.** The backend exchanges the caller's token on-behalf-of for a Graph token *that is the caller*, and asks Microsoft which directory roles they hold. Unless one of them is on the allowlist — by default Global Administrator, Exchange Administrator, Security Administrator or Privileged Role Administrator — the request is refused.

Step 5 is the important one for two reasons. It means **the backend never
grants anyone a capability they did not already have**: everyone who can use it
could already do the same thing by hand in the Exchange admin centre. And
because it round-trips to Microsoft, a caller whose session has been revoked
stops working within the five-minute role cache, without any action on your
part.

### The credential itself

- **A certificate, not a secret.** The backend authenticates to Microsoft with a signed client assertion. No client secret exists in this deployment, so there is no secret to leak in an environment variable, a log line or a screenshot.
- Mounted read-only at `/certs`, on a container that runs as an unprivileged user (UID 10001), with a read-only root filesystem, all Linux capabilities dropped, and `no-new-privileges`.
- **No published port.** In the compose file the backend is only reachable from the nginx container over the internal Docker network. It is not exposed to your LAN.
- **One backend per tenant.** `TENANT_ID` is fixed at start; a token from any other tenant is rejected. There is no multi-tenant mode, deliberately — a compromise of one customer's backend cannot reach another customer.

### Narrowing the Exchange permission

The service principal needs Exchange rights. The blunt option is the Exchange
Administrator directory role. The better option, which `create-backend-appreg.ps1`
prints instructions for, is **Exchange RBAC for Applications**: assign only the
management roles that carry the seven cmdlets, and scope them to a recipient
group rather than the whole tenant:

```powershell
New-ServicePrincipal -AppId <backend app id> -ObjectId <sp object id>
New-ManagementRoleAssignment -App <sp object id> -Role "Mail Recipients" `
    -CustomRecipientWriteScope "IR mailboxes"
```

Verify which role actually carries a cmdlet before assuming:
`Get-ManagementRole -Cmdlet Get-InboxRule`.

### Everything is logged

Every request — allowed or denied — is appended as one JSON line to
`/var/log/triage/audit.jsonl` (mounted to `./audit`) and echoed to
`docker logs`. Each line records the timestamp, the caller's UPN and object ID,
the roles that authorised them, the route, the target mailbox, the specific
rule or delegate, the outcome and the duration. It never contains tokens,
passwords or mailbox content. Ship it to your SIEM.

### Other controls

- **Rate limiting**: 30 requests per minute per caller, and at most two concurrent PowerShell operations.
- **Protected mailboxes**: `PROTECTED_UPNS` lists accounts the backend refuses to touch regardless of who asks — put your break-glass accounts there.
- **Request size** capped at 64 KB; PowerShell operations time out after two minutes.
- **No stack traces** are returned to callers, only the reason for the refusal.
- **Zero npm dependencies.** The API is a single standard-library Node file. The supply chain you have to audit is `backend/server.js` plus two Microsoft base images.

---

## What an attacker would have to do

**To read one tenant's evidence via another analyst.** Impossible by design —
there is no shared storage, and delegated tokens are tenant-scoped by Microsoft.

**To use the browser tool to change something.** They need the analyst's
signed-in session *and* the analyst's own directory permissions. Stealing the
static site gains nothing; the tool has no power of its own.

**To abuse the Exchange backend remotely.** They would need a token that is
signed by Microsoft, minted for the backend's audience, issued to the Triage
SPA specifically, delegated to a real user, and belonging to someone holding an
incident-response directory role. In practice that means compromising an
Exchange or Global Administrator account — at which point the backend is not
the interesting target, because that account can already do all of this and far
more directly.

**To abuse it locally.** They would need code execution on the Docker host to
read `/certs`. Treat the host as a Tier-0 admin workstation: that certificate is
equivalent to standing Exchange recipient-management rights.

**To poison the code you run.** This is the real residual risk, and it is worth
being explicit about. The browser executes whatever JavaScript the host serves,
and that JavaScript holds your delegated token. Anyone who can push to the
GitHub repository — a compromised collaborator account, or GitHub itself — could
ship malicious code. Mitigations: the CSP means injected code still cannot send
data anywhere but Microsoft; branch protection, required review and mandatory
2FA on the repository; and `GIT_SYNC=off` pins a container to a version you have
reviewed instead of pulling `main` on every start.

---

## Deploying it more safely

- Run `create-appreg.ps1 -ReadOnly` if you never want the containment option to exist in your tenant.
- Do not deploy the backend unless you want the mailbox step automated.
- Use Exchange RBAC for Applications with a scoped recipient filter rather than the Exchange Administrator role.
- Put break-glass accounts in `PROTECTED_UPNS`.
- Narrow `REQUIRED_ROLES` to the smallest set your responders actually hold.
- Set a calendar reminder for the certificate expiry (twelve months by default).
- Ship `./audit/audit.jsonl` to your SIEM and alert on `action.change` events.
- Enable branch protection and required reviews on the repository, and pin the container with `GIT_SYNC=off` in regulated environments.
- Remove everything at any time by deleting the two enterprise applications in Entra — that revokes consent tenant-wide and the certificate becomes useless.

---

## Reporting a vulnerability

Email **security@limon-it.nl**. Please do not open a public GitHub issue for a
security problem. We will confirm receipt within two business days.

---

*Findings are indicators, not verdicts — verify before acting. This document
describes the design as of build 8; validate the Microsoft permission and role
requirements against Microsoft Learn before adopting any of it as a formal
procedure.*
