# Triage BETA 22 / desktop 0.22.0 — review (2026-09-15, evening)

Scope: the uncommitted working tree of `~/REPO/triage` as of 15 Sep ~15:30 (main build 14 + BETA 22 + `desktop/` Electron app + `desktop/collector/*.ps1`). Every file under `BETA/js`, `BETA/css`, `desktop/`, `backend/`, the setup scripts, docs and tests was read; `node --test tests/*.test.cjs` was run (63 pass, the 20 failures are all `spawn pwsh ENOENT` — the runner had no PowerShell, not a code failure).

The short version: the pivot to a portable Electron + bundled PowerShell collector is the right call and the desktop code is careful (sandboxed renderer, `trusted()` IPC check, validated plans, atomic checkpoints, safeStorage profiles, pinned runtime hashes). The three things that will hurt in real use are (1) the unresolved Mac sign-in hang, which is an architecture problem more than a bug, (2) the analyzers, which will flood a normal tenant with High findings, and (3) the amount of dead code and process notes that is now shipped inside the app and the website.

---

## 1. Fix first

### 1.1 Mac delegated sign-in hang — stop doing interactive auth inside PowerShell

Today `desktop/main.cjs:69-89` spawns `pwsh -NonInteractive -File collect.ps1` with piped stdio, and `collect.ps1:76/143` runs `Connect-MgGraph -Scopes …` and `Connect-ExchangeOnline` interactively from inside that child. Each of the two SDKs (Azure.Identity in Graph, MSAL.NET in EXO) opens its own system browser, its own loopback listener and its own token cache, in a process that has no TTY and whose stdin is reserved for the `collect` release line. That is exactly the setup in which "browser says success, app keeps waiting" happens, and Beta 22's stage reporting can only tell you *where* it stalls, not fix it. It also means: two browser sign-ins per case, delegated Graph consent lands on Microsoft's first-party "Microsoft Graph Command Line Tools" app (client `14d82eec-…`) instead of on the Triage registration the customer already consented to for the website, and tenants that block that first-party app cannot use the desktop at all.

Recommended change — move sign-in into the Electron main process and hand tokens to PowerShell:

```mermaid
sequenceDiagram
    participant R as Renderer (desk.js)
    participant M as Electron main (msal-node, public client)
    participant B as System browser
    participant G as pwsh collect.ps1 -Mode graph
    participant X as pwsh collect.ps1 -Mode exchange
    R->>M: collect(plan)
    M->>B: authorize (Triage app id, authority /{tenantId}, loopback http://localhost:{port})
    B-->>M: code → tokens (Graph scopes)
    M->>M: acquireTokenSilent(https://outlook.office365.com/.default)
    M->>G: stdin: {graphToken, account, tenantId}
    G->>G: Connect-MgGraph -AccessToken (SecureString) ; verify Get-MgContext.TenantId/Account
    M->>X: stdin: {exoToken, organization}
    X->>X: Connect-ExchangeOnline -AccessToken -Organization ; verify Get-ConnectionInformation
    G-->>M: TRIAGE_PROGRESS checkpoints
    X-->>M: TRIAGE_PROGRESS checkpoints
```

Concretely:

- Add a "Mobile and desktop applications" platform with redirect `http://localhost` to the existing Triage app registration (`8f1b5185-…`), and add the delegated **Office 365 Exchange Online → Exchange.Manage** permission to it. Use `@azure/msal-node` `PublicClientApplication` with the loopback redirect (Entra ignores the port for public-client localhost URIs, so a random port is fine).
- One interactive sign-in for Graph scopes; then `acquireTokenSilent` for `https://outlook.office365.com/.default` with the same account — one prompt, one account, no operator-mismatch check needed (keep the check anyway, it is cheap).
- `collect.ps1`: `Connect-MgGraph -AccessToken (ConvertTo-SecureString $t -AsPlainText -Force) -ContextScope Process` and `Connect-ExchangeOnline -AccessToken $t -Organization $org -ShowBanner:$false`. Tokens arrive on stdin exactly like the certificate credential does today (`main.cjs:406`), never on the command line. Pass a fresh token again on a 401 (Graph tokens last ~60–90 min; UAL polling + paging can exceed that on big tenants — have the worker emit `TRIAGE_PROGRESS:{type:"token-expired"}` and let main answer with a new token on stdin).
- This also removes `-DisableWAM`, the `UserPrincipalName` hint dance, the "choose the same account twice" guidance and the 10-minute watchdog's main reason to exist. Keep the watchdog.
- Cheapest interim step if you want to test tonight: `Connect-MgGraph -ClientId <Triage app id> -TenantId $tenant …` (one line) so consent lands on your own registration, and add `2>&1 | Tee-Object` of the worker's stderr into the attempt folder so the stall point is captured even when the 10-minute kill fires.

### 1.2 Analyzer false-positive floods (blocks use on any real tenant)

All verified in `BETA/js/analyzers.js` / `blacklists.js`:

- `analyzers.js:423` `risky = scopes.filter(s => table[s])` — `BL.DEL_PERM` maps `openid`, `profile`, `email`, `offline_access`, `User.Read`, `User.ReadBasic.All` to `"Low"`, which is truthy, so **every** delegated grant in the tenant becomes an "OAuth app holds risky delegated permissions" finding. Filter on `SEV_RANK[table[s]] < SEV_RANK.Low` (or drop the Low rows).
- `blacklists.js:5` ASN list contains AT&T (7018), Comcast (7922), Google (15169), BT, Telstra, NTT, Level 3, Hetzner, Telecom Italia …, and `blGroup` (`analyzers.js:245-249`) reports every successful sign-in from them as **High**. Check this list against `~/REPO/Microsoft-Analyzer-Suite/Blacklists/ASN-Blacklist.csv` (the provenance file says the upstream revision is unverified) and, whatever MAS says, do not emit High for a residential ISP; MAS itself only *highlights* these. `ASN_WHITE` / `asnWhitelisted()` exist and are never called.
- `blacklists.js:11` puts OfficeHome, Office 365, Office 365 Exchange Online, Intune Company Portal and VS Code on the app blacklist at Medium — that fires on every tenant. Drop the first-party entries or make them Info.
- `analyzers.js:186` "AiTM fingerprint" = OfficeHome + no device id + error in {0, 50074, 50140, 53000} → High. That is every unmanaged-browser sign-in. Require interactive + at least one other signal (blacklisted/unknown ASN, new country, or a `sessionId` seen from two IPs).
- `analyzers.js:194-208` 30-second different-IP rule runs over interactive **and** non-interactive sign-ins (`evidence.js:5-6` merges them; the `interactive` flag computed at line 141 is unused). Phone + laptop token refreshes trip it constantly. Restrict to `isInteractive === true`.
- `analyzers.js:404` emits "Risky user: none (confirmedSafe)" — skip `confirmedSafe` and riskLevel `none`.
- `blacklists.js:13-14` typos that never match: `Notes.Read.Al`, `Sites.FullControl.Al`, `Policy.Read.Identity.Protection`, `Policy.Read.Permission.Grant`; `COUNTRY.ID = "Indonesa"`.
- Rules that read fields no collector produces (dead on live data, alive on demo data only): dormant-admin uses `lastInteractiveSignIn`/`lastSignIn` (`analyzers.js:475`, nothing selects `signInActivity`); `BL.APP_PERM` unreachable (`permissionType` hard-coded `"Delegated"`, `collect.js:267`, no `appRoleAssignments` collected); `BL.OPERATION` (39 UAL ops) is never referenced — `UAL_OPS` is a smaller hand copy that lacks `Add-MailboxPermission`, `Remove-MailboxPermission`, `HygieneTenantEvents`, `TeamsImpersonationDetected`, `FileSyncDownloadedFull`.
- Inbox-rule content analysis (`analyzers.js:345-357`) reads `auditData.Parameters[]`; Outlook-desktop/EWS `UpdateInboxRules` records carry the rule in `OperationProperties` (`RuleName`, `RuleActions`, `RuleCondition`) — forwarding rules created from Outlook are missed.
- `oauth2PermissionGrant` has no `createdDateTime`, so OAuth findings have no time on live data; `blApp(grant.appId || grant.clientId)` (line 425) — `clientId` is the SP **object** id, so when `servicePrincipals` is not collected the app blacklist silently never matches grants.

Add one "quiet tenant" fixture with real Graph-shaped records (grants with only `principalId/consentType`, role assignments with `principalId + roleDefinition`, beta sign-ins with `signInEventTypes`, OfficeHome browser sign-ins from a Dutch ISP) and assert **zero High/Medium**. `beta.engine.test.mjs` currently only runs on `demo.js`, which is hand-shaped to fire every rule, and it does not load `exchange-analysis.js` at all.

### 1.3 Bundle hardening (case files are untrusted input)

- `evidence.js:225-232` `unpack` validates CATALOG keys but does not reject extra `raw`/`manifest` keys, and the SHA-256 is unkeyed, so any crafted bundle "verifies". `desk-model.js:200-204` builds timeline references from **all** `Object.entries(ev.raw)`, and `desk.js:801` writes `data-ref="${t.reference}"` unescaped; `evidence.js:241-245` lets a manifest entry override `key`, which `desk.js:668` writes into `id=`/`data-source=`/`aria-controls=` unescaped. The CSP (`script-src 'self'`) on the desktop server, `serve-web.mjs` and nginx blocks inline handlers, so this is attribute injection rather than script execution on your own hosting — but reject unknown keys in `unpack`, never let manifest override `key`/`label`, and escape those attribute values. A non-array extra raw key currently throws in `rows.map` and blanks the Timeline page.
- Imported action-log entries without `outcome` crash the runbook page (`desk.js:832` → `badge(undefined)` → `replaceAll` TypeError).

### 1.4 The brand link reloads the app and loses the case

`BETA/index.html:19` `<a class="brand" href="index.html">` resolves to exactly `origin + "/BETA/index.html"`, which `main.cjs:638-640` explicitly allows, so clicking the logo mid-collection reloads the renderer; the PowerShell job keeps running in main but the page no longer tracks it. In the `?localCase=1` browser viewer the same link drops the query and the case. Make it a `data-page="home"` button and add a `beforeunload` guard while `ev` is open (web too).

### 1.5 Coverage silently capped

- Web: `collect.js:163` `maxPages: 25` for every source (25,000 sign-ins/audit rows/UAL records); desktop uses 100 pages (`collect.ps1:44`). A 30-day tenant-wide non-interactive query blows through 25 pages on a mid-size tenant, and the analyzers then run on a truncated set while the findings read as tenant-wide. Make the cap per source and larger, or at least surface "analysis ran on a partial set" on the Overview.
- `roleManagement/directory/roleAssignments` and `reports/authenticationMethods/userRegistrationDetails` have no `$top` in either collector (`collect.js:89-92`, `collect.ps1:101-102`) → default page size × cap ≈ 2,500 users for the tenant MFA report. Add `$top=999`/`$top=500`.
- User-scope UAL uses only `userPrincipalNameFilters` (`graph.js:242`, `collect.ps1:111`) → admin actions **against** the victim (`Add-MailboxPermission`, `Set-Mailbox`, `Set-InboxRule -Mailbox victim`, delegate `MailItemsAccessed`) are logged under the admin and are excluded. Add `objectIdFilters: [objectId]` to the audit query body.
- `directoryAudits` user filter combines `targetResources/any(…)` with `or initiatedBy/user/id eq` (`collect.js:109-116`, `collect.ps1:94`) — not documented as supported; confirm on one live tenant or split into two queries like OAuth already does.

### 1.6 Web token/tenant handling

- `graph.js:97` popup fallback returns `acquireTokenPopup(req).accessToken` without checking `result.account` against the captured account — an operator who picks another account in the popup collects the wrong tenant under the original case header. Compare `homeAccountId`/`tenantId` before returning.
- Web authority is `/organizations` (`authConfig.js:8`); the tenant is inferred from the MSAL account. A guest/partner operator gets a home-tenant token. The desktop pins `-TenantId`; let the web plan do the same (authority `/{tenantId}` once the tenant ID is entered).
- `Policy.Read.All` is requested in both collectors and never used; drop it (smaller consent screen for customers).

---

## 2. Change

### 2.1 Delete what Beta 22 no longer loads

`BETA/index.html` loads theme, build, authConfig, graph, evidence, blacklists, exchange-analysis, analyzers, import, demo, collect, `../js/journal.js`, `../js/analysis-service.js`, desk-model, desk — nothing else. Referenced by no HTML, test runner or script:

- `BETA/js/app.js`, `quick-shell.js`, `unified-workspace.js`, `workspace.js`, `embedded.js`, `report.js`, `worker.js`, `shared-findings.js`, `quick-auth.js`, `config.js`
- `BETA/css/app.css`, `beta.css`, `quick.css`, `workspace.css`
- `BETA/beta.dom.test.mjs`, `BETA/quick.dom.test.mjs` (only `desk.dom.test.mjs` runs via `npm run test:browser`)
- `docker-compose.beta.yml`, `backend/collector/*`, `backend/policy.js`, `Initialize-BetaCollector.ps1`, `Configure-BetaExchangeRoles.ps1`, `BETA/docs/AZURE-OPTION.md`, `BETA-7-GUIDE.md`, `PHASE-1-2-GUIDE.md` (README calls them "legacy"; git history keeps them)

`desktop/scripts/package.mjs:22-30` copies the whole `BETA/` and `js/` trees into the app, and GitHub Pages serves them, so all of this is currently shipped. Remove it in one commit before the beta tree grows further. Also move `review/2026-09-15/*.md` (20 process notes, 150 KB) out of the served tree or into `docs/changelog/` — `review/…/admin-api-probe.html` should not be on the public site.

### 2.2 CI never runs on your commits

`.github/workflows/beta-tests.yml` triggers on `pull_request` and `workflow_dispatch` only; you commit straight to `main`, so it has never gated anything. Add `push: branches: [main]`. Add a `windows-latest` job that runs `npm run desktop:package:win` and `Triage.exe --smoke-test` — the Windows build has never been executed on Windows (BETA-22 note: "cross-packaged and archive-verified"). GitHub's ubuntu/windows runners have `pwsh`, so the 20 "actual …" PowerShell tests can run there too (check they resolve `-ModuleRoot` to the fixtures, not to `desktop/runtime/`).

### 2.3 Publishing the desktop builds

`BETA/downloads/` is gitignored, so the site's download buttons point at files that only exist on your Mac. Build in CI (`macos-latest` for the arm64 app) and attach the ZIPs + `SHA256SUMS.txt` to a GitHub Release; link the release from the site. And budget the Apple Developer ID (€99/yr): with an ad-hoc signature every rebuild has a different code signature, so besides the `xattr` dance, macOS Keychain will re-prompt "Triage wants to use your confidential information" for the safeStorage key on every new build, and Gatekeeper on a customer/consultant Mac will refuse it outright unless they know the trick. Notarization also fixes the bundled `pwsh` being flagged.

### 2.4 Desktop app polish (all verified in code)

- `desk.js:1085-1088` "Check desktop readiness" sets `page = "collector"`, but `collector()` → `quick()` returns `newCasePanel()` first when a case is open (line 458), so the readiness result is never shown. Render it in a dialog.
- Single save slot: `selected-case.json` / journal `id:'selected'` — "Save" silently overwrites the previously saved case with no warning. Key by `caseId` and list them, or at least confirm.
- `openCase` renders "No signals in these results" while `analyze()` is still running (`desk.js:761/783` only guard on `busy`). Show "Analyzing…" while `analysisJob?.evidence === ev`.
- Every `btn()` is `type=submit` (`desk.js:31`); on desktop the first button in the form is `customer-manage`, so Enter in "Account to check" opens Customer connections instead of running the check; in `profileForm` Enter opens the native file dialog. Give non-primary buttons `type="button"`.
- Failed web collections log `collection-end` twice (`desk.js:1018` catch + `:1023` finally); a resume that the collector rejects for tenant mismatch still writes `collection-start`. Validate before logging.
- Footer says "Build 21 · Guide" (`index.html:77`); sidebar says BETA 22.
- Web "Prepare a collection plan" dialog renders a "Customer connections" button that is a no-op in the browser (`desk.js:1048` only routes `customer-*` when `N`).
- `.badge.confirmed / .investigating / .exception` have no CSS (`desk.css:313-340`) — the review state looks identical to unreviewed. `#connection` is hidden ≤1050px so a tablet user cannot see which account is connected.
- Focus: `review`, `record-outcome`, `add-note` re-render `#main` and drop focus to `<body>`; `#main` has `tabindex=-1` but is never focused; `#dialog-notification` is scrolled to, never focused.
- `main.cjs:452-463` releases Graph, awaits its whole run (UAL polling up to 10 min) and only then releases Exchange. The Exchange child already holds its session; release both and `Promise.all` them.
- `privateToken` viewer: the token never expires and the case stays served until quit or the next handoff. Expire it after first fetch + N minutes.
- `collect.ps1:175` builds `"${upn}:$folderPath"` by replacing `/` with `\`; a folder whose name contains `/` breaks. MAS uses `"${upn}:" + $folder.FolderId` — do the same.
- `New-TriageRegistrations.ps1` assigns to `$matches` (an automatic variable) — rename. Consider offering the built-in **View-Only Recipients** role group as the default Exchange RBAC instead of seven one-cmdlet custom roles (verify it contains `Get-MailboxAuditBypassAssociation`; if not, keep one custom role for that cmdlet only) — far less for a customer's Exchange admin to review.

### 2.5 Working tree

35 modified + ~40 untracked files, one commit behind on everything since "Scope Unified Audit Log findings" (8fb921c). Commit `package.json` + `package-lock.json`, `desktop/` (sources only — `.cache/.stage/out/runtime` are already ignored), `tests/`, `tools/`, `BETA/` after the deletions in 2.1, in a few themed commits rather than one, so `git bisect` stays useful. CLAUDE.md's rule that you run `git commit` yourself still applies; the exact commands are at the end.

---

## 3. Cheap coverage wins (data already collected or one extra query, no new consent)

1. **Session replay**: sign-ins already carry `sessionId`, `uniqueTokenIdentifier`; flag one `sessionId` seen from ≥2 IPs/ASNs. Zero collection cost and it makes the AiTM rule (1.2) defensible.
2. **Service-principal sign-ins**: third query `signInEventTypes/any(t:t eq 'servicePrincipal')` on the same endpoint; MAS has a dedicated analyzer.
3. **appRoleAssignments** (`/users/{id}/appRoleAssignments` or per SP) — brings `BL.APP_PERM` to life.
4. **PIM**: `roleEligibilityScheduleInstances` / `roleAssignmentScheduleInstances?$filter=principalId eq …` — eligible admins are invisible today (`Directory.Read.All` covers it).
5. **Role-escalation audits** already in `directoryAudits` but not in the `flag()` list (`analyzers.js:276-285`): `Add member to role`, `Add eligible member to role`, `Add member to group` (role-assignable), `Update user` with `StrongAuthenticationMethod`, `Add unverified domain`.
6. **MailItemsAccessed depth**: use `ClientInfoString`, `AppId`, `SessionId`, `Folders[].Path`/`FolderItems` counts; run the UA/APP blacklists against `ClientInfoString`.
7. **UAL `UserLoggedIn`/`UserLoginFailed`** rows are collected and unused — the UA/ASN checks apply there too.
8. **Weak MFA**: `userRegistrationDetails.methodsRegistered`/`defaultMfaMethod` already collected — flag SMS/voice-only.
9. **Exchange snapshot**: add `Get-TransportRule` (tenant, cheap) and `Get-MessageTraceV2 -RecipientAddress/-SenderAddress $upn -StartDate (-10d)` to the fixed command list and the RBAC role — that is the gap that keeps the runner at 11/16 MAS analyzers.

---

## 3b. Hosting the desktop downloads

`Triage-macOS-arm64.zip` is 233 MB and `Triage-Windows-x64.zip` is 306 MB. GitHub refuses single files over 100 MB in a repository, caps a Pages site at 1 GB, and a free account's Git LFS quota (1 GB storage, 1 GB bandwidth/month) would be gone after three downloads. GitHub **Releases** have none of those limits: assets up to 2 GB each, no storage/bandwidth quota on a public repo, CDN-served, free. Use `https://github.com/nurejev/triage/releases/latest/download/Triage-macOS-arm64.zip` (and the Windows twin) as the site's download links and never put the ZIPs in git again. Container registries (GHCR/ACR) store OCI layers, not browser downloads; a Web App or Container App is paid compute to serve two static files. The only Azure option that fits is a Storage account with a public blob container (cents per month) if a `downloads.limon-it.nl` independent of GitHub is ever wanted — not needed now. The `release.yml` workflow in the work package builds both ZIPs on `macos-latest`/`windows-latest` on a `v*` tag and attaches them plus `SHA256SUMS.txt`.

Size: the bundled `powershell/` tree is 204 MB uncompressed on macOS; `ExchangeOnlineManagement/netFramework` (25 MB) is never loaded by pwsh 7, `Microsoft.Graph.Authentication/custom` (22 MB) and the other-OS `runtimes/*` folders under `Dependencies` are dead weight too. Pruning in `prepare-runtime.py` should take roughly a third off each archive.

## 4. Suggested order

1. Commit the current tree (2.5) after deleting dead files (2.1). Fix footer/`Build 21`.
2. Analyzer FP fixes + quiet-tenant fixture (1.2) — half a day, and it changes what every user of the site sees today.
3. CI on push + Windows smoke (2.2).
4. Bundle hardening + brand link + coverage caps + `objectIdFilters` (1.3–1.5).
5. msal-node token hand-off (1.1) — this is the fix for the Mac symptom and for double sign-in; try the `-ClientId` interim step first to see whether consent-on-first-party-app is part of the story.
6. Release pipeline + Developer ID (2.3), then the coverage wins (3).

Commands (PowerShell, from `~/REPO/triage`):

```powershell
Set-Location ~/REPO/triage
# some of these are tracked, some untracked — Remove-Item handles both, `git add -A` records the deletions
Remove-Item -Force BETA/js/app.js, BETA/js/quick-shell.js, BETA/js/unified-workspace.js, BETA/js/workspace.js, BETA/js/embedded.js, BETA/js/report.js, BETA/js/worker.js, BETA/js/shared-findings.js, BETA/js/quick-auth.js, BETA/js/config.js
Remove-Item -Force BETA/css/app.css, BETA/css/beta.css, BETA/css/quick.css, BETA/css/workspace.css, BETA/beta.dom.test.mjs, BETA/quick.dom.test.mjs
Remove-Item -Force BETA/docs/AZURE-OPTION.md, BETA/docs/BETA-7-GUIDE.md, BETA/docs/PHASE-1-2-GUIDE.md
npm test
npm run test:browser
# second, separate commit — the container collector is still exercised by tests/collector.test.cjs,
# compose-smoke.cjs and docker-smoke.cjs (tools/test.mjs runs every tests/*.test.cjs), so remove those together
# and the "test:legacy:containers" script in package.json; grep first: git grep -l "backend/collector"
Remove-Item -Recurse -Force backend/collector, backend/policy.js, docker-compose.beta.yml, Initialize-BetaCollector.ps1, Configure-BetaExchangeRoles.ps1, tests/collector.test.cjs, tests/compose-smoke.cjs, tests/docker-smoke.cjs
npm test
git add -A BETA desktop tests tools package.json package-lock.json .github README.md SECURITY.md
git commit -m "BETA 22: portable desktop collector, customer certificate profiles, remove legacy container beta"
```

(Check `git status` before the commit — `review/` is intentionally not in the `git add` list; decide separately whether it belongs in the repo.)
