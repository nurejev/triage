# BETA 23 / desktop 0.23.0 — handover (2026-09-15, evening)

Executed from the work package `WORK-PACKAGE-BETA-23.md`. Everything below is in your working tree, uncommitted. Node-only tests pass on the Mac VM (`node BETA/beta.engine.test.mjs` all passed; `node --test tests/*.test.cjs` 56 pass, the 15 remaining failures are all `spawn pwsh ENOENT` because the sandbox VM has no PowerShell — run them on your own shell, see §3).

## 1. Done

| WP | Status | Notes |
|---|---|---|
| WP-01 dead code | done (moved, not deleted) | The sandbox may not delete files, so everything is in `_to_delete/` — 28 files + `backend/collector/{server.js,jobs.js,snapshot.ps1,Dockerfile}`. `backend/policy.js` and `backend/collector/auth.js` stayed: the **main site's** containment backend (`backend/server.js`) requires them. `tests/powershell.test.cjs` + `tests/fixtures/snapshot.ps1` went with the legacy collector; `test:legacy:containers` script removed. |
| WP-02 CI | drafted | `.github/workflows/` is protected from the sandbox; both files are in `review/2026-09-15/workflows/` — move them (commands in §3). |
| WP-03 release | drafted | `release.yml` builds both ZIPs on `macos-latest`/`windows-latest` on a `v*` tag and attaches them + `SHA256SUMS.txt`. Site download links not yet switched to `releases/latest/download/…` — do that in `desk.js` (`Download for macOS/Windows` buttons) once the first release exists. |
| WP-04 runtime | done, unverified | `prepare-runtime.py` now prunes (EXO `netFramework` + `ref`, other-OS `runtimes/*`, Windows msalruntime DLLs on mac, PSReadLine, PSResourceGet, `*-Help.xml`, `en-US`). `--no-prune` keeps the old behaviour. `custom/` in Graph.Authentication was left alone (its `.psm1` dot-sources it). **Verify:** `npm run desktop:runtime` then `npm run desktop:start` → readiness must be green, then run one real collection. |
| WP-10…15 analyzers | done | See `build.js` changelog. New `beta.engine.test.mjs` has the quiet-tenant fixture (real Graph shapes → nothing above Info) plus rule fixtures for OperationProperties rules, upstream UAL ops, scripting MailItemsAccessed, session replay, phone-only MFA, PIM audit, Exchange snapshot. `blacklists.js` typos fixed; ASN list untouched (carrier ASNs are rated Info in `analyzers.js` `ASN_CARRIER`). |
| WP-20 bundle hardening | done | `unpack` rejects unknown `raw`/`manifest` keys and manifest `key` overrides; `coverage()` never lets a manifest rename a source; `data-ref`/`data-source`/`id` attributes escaped; `badge()` tolerates missing outcome; `refresh()` no longer crashes on rows without `principalId`. |
| WP-21 brand/unload | done | Brand is a `data-page="home"` button; `will-navigate` denies everything in Electron; `beforeunload` warns only while a collection is running (a case-open guard would fight the Playwright reloads in `desk.dom.test.mjs`). |
| WP-22 desk | mostly done | Readiness → dialog when a case is open; saved cases keyed by `caseId` (IndexedDB record per case + `selected` pointer; desktop `saved-cases/<caseId>.json` + `selected-case.json` pointer, old whole-bundle pointer still readable); "Open saved case" lists them when more than one; "Analyzing…" state; non-primary `btn()` are `type=button`; single `collection-end`; resume checks tenant before logging; Customer connections hidden on web; badge styles for confirmed/investigating/exception; workers released in parallel; viewer token expires 15 min. **Not done:** focus management after review/note, `#connection` on narrow screens. |
| WP-30/31/32 collectors | done | Page caps 200/50; `$top=500` on tenant MFA report; users carry `signInActivity` (single GET in user scope); UAL `objectIdFilters`; PIM `roleEligibilityScheduleInstances` as second admins query (`kind: "eligible"`); service-principal sign-ins as second non-interactive query (tenant scope); popup token account/tenant check. **Consent change:** `Policy.Read.All` → `RoleManagement.Read.Directory` in `authConfig.js`, `collect.ps1`, `profiles.cjs`, `New-TriageRegistrations.ps1`, docs. Existing wizard `settings.json` folders from Beta 22 will be rejected by the script ("Unexpected Graph permission set") — export a new one. |
| WP-33 coverage | partly | Done: SP sign-ins, PIM, weak MFA, role/MFA/domain audits, MailItemsAccessed depth, UAL UserLoggedIn UA checks, dormant admins via signInActivity. **Not done:** `appRoleAssignments` (application permissions), `Get-TransportRule` / `Get-MessageTraceV2` in the mailbox snapshot (needs the RBAC role list in the wizard too). |
| Icon | done | `desktop/icon.svg` is the source (green squircle, gold magnifier, pulse). `icon.png`/`icon.icns` use the HIG 824-px tile with margin; `icon.ico` is full-bleed with 16–256 px PNG entries. `create-icon.mjs` rewritten to regenerate all three from the SVG. Previews: `triage-icon-mac.png`, `triage-icon-win.png` in this chat. |
| Build | done | BETA 23, `?v=23`, footer "Build 23", `package.json` 0.23.0, `main.cjs` collector string, `core.cjs` BETA_BUILD, changelog entry, README/BETA README/COLLECTOR/CUSTOMER-CONNECTIONS updated. |

## 2. Not started (next package)

WP-40 `-ClientId` probe and WP-41 msal-node token hand-off (the Mac sign-in fix), WP-42 Developer ID, `appRoleAssignments`, transport rules / message trace, switching the site download buttons to the Release URL, focus management.

## 3. Verify and commit (PowerShell, from `~/REPO/triage`)

```powershell
Set-Location ~/REPO/triage
# 1. workflows into place, legacy files gone
Move-Item -Force review/2026-09-15/workflows/release.yml .github/workflows/release.yml
Move-Item -Force review/2026-09-15/workflows/beta-tests.yml .github/workflows/beta-tests.yml
Remove-Item -Recurse -Force review/2026-09-15/workflows, _to_delete
# 2. tests that need real pwsh (mocked modules under tests/fixtures; no Microsoft calls)
npm test
npx playwright install chromium
npm run test:browser
node tests/desktop-smoke.mjs; node tests/desktop-progress.mjs; node tests/desktop-connections.mjs; node tests/desktop-profiles.mjs
# 3. runtime prune + a real readiness check
npm run desktop:runtime
npm run desktop:start        # readiness green, one delegated collection on a test tenant
# 4. commit (themed)
git add -A desktop; git commit -m "desktop 0.23.0: parallel workers, keyed saved cases, pruned runtime, new icon"
git add -A BETA; git commit -m "BETA 23: analyzer tuning, quiet-tenant fixture, PIM/SP/session-replay coverage, bundle hardening, desk fixes"
git add -A tests tools package.json package-lock.json .github js/journal.js; git commit -m "tests: beta 23 fixtures, CI on push, Windows smoke, release workflow"
git add -A README.md BETA/README.md BETA/docs SECURITY.md CLAUDE.md Dockerfile .dockerignore .gitignore docker review; git commit -m "docs: beta 23, download hosting on GitHub Releases"
git push
git tag v0.23.0; git push origin v0.23.0   # triggers release.yml
```

Things that can legitimately fail in step 2 and what they mean: `tests/desktop.test.cjs` admins/MFA cases were updated for the two-query admins source and `?$top=500`, and `tests/profiles.test.cjs` for the single-user GET — if a **different** desktop test fails, it is the parallel release or the pointer file; `tests/desktop-progress.mjs` was updated for the pointer. `desk.dom.test.mjs` imports `tests/execution-ui.mjs` and `tests/oauth-scope-ui.mjs`; neither was touched.

The PowerShell in `collect.ps1` was edited without a PowerShell parser available here (four query lines and the `SingleUserReport` branch) — `npm test` runs it through the mocked modules, which is the syntax check.

## 4. Addendum (after first live run, 15 Sep late evening)

- **Graph 400 on every source in certificate mode** — cause found: the subject lookup added `signInActivity` to `/users/{upn}?$select=…`; Graph rejects that property when a user is addressed by UPN. Reverted on the lookup; the `users` source still reads `signInActivity` by object ID. `Graph-Request` errors now include Graph's `error.code: message` and the request path.
- **Exchange app-only: "The role assigned to application … isn't supported"** — the application has no Exchange RBAC yet. Either run the generated `Exchange-RBAC.ps1` from the setup folder (custom read-only role group, Microsoft's documented "Option 2") or give the app **Exchange Recipient Administrator** / **Global Reader** in Entra. The collector now says this in plain words instead of the raw module error.
- **Safari "Dit is een onveilig formulier"** — Safari's warning for the Microsoft sign-in page posting the auth code to the PowerShell listener on `http://localhost`. *Verstuur* completes sign-in; *Annuleer* is why the app "keeps waiting". Chrome/Edge don't warn. Goes away with WP-41.
- **Sign-in every run** — delegated Graph now uses `-ContextScope CurrentUser` (Keychain/DPAPI token cache) and no longer disconnects in delegated mode; Exchange still prompts until WP-41.
- **Workflow** — sidebar is now a numbered path: Start → 1 Collect → 2 Overview → 3 Findings → 4 Evidence → 5 Timeline → 6 Respond · first hour → 7 Action log & handover. A finding's dialog has "Show source records →" (opens Evidence with that source expanded) and "Respond · first hour →" (opens the runbook at Contain). Runbook phase "Secure evidence" renamed "Preserve & export evidence" so it no longer reads like the Evidence page.

## 5. WP-50 — the live first-hour runbook is now the beta's Respond page

`js/contain.js` (the main site's executing containment runbook), `js/blast.js`, `js/templates.js`, `js/case.js` and `js/demoblast.js` are loaded by `BETA/index.html`; the runbook mounts into a persistent `#screen-contain` next to `#main` when Respond is opened for a case with a target account. Desk provides the `TriageApp` shim (`triageFor`/`showScreen`/`containSearch` → desk pages), `BETA/js/graph.js` got `ualQuery()` for the blast-radius checks, `BETA/js/authConfig.js` carries the same write scopes as the main site (requested only when arming), and `desk.css` includes the containment rules and palette from `css/app.css` scoped under `#screen-contain`/`#confirmModal`. Every runbook log entry is mirrored into the case action log (`containment-<result>`) so it lands in exports and the handover.

Scope rules: one-account cases open the runbook directly; tenant-wide cases ask for the account first (resolved in the signed-in tenant; sample case uses the sample users). The desktop app and the private viewer cannot sign in to Graph in the renderer, so they show the recording checklist with a note to open the case on the website — that limitation goes away with WP-41. The old `desk-model` phases remain as that fallback.

Not yet done: `desk.dom.test.mjs` coverage for Respond (mount, account chooser, log sync); the demo probe was run headless in Chromium only.
