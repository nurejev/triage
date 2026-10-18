# BETA 31 → 33 / desktop 0.33.0 — one workflow (handover)

Date: 2026-09-17. Three builds in the working tree: **BETA 31** is the workflow itself; **BETA 32** is the fix round after Mihai's first live test the same morning (rail overflow, Respond asking to connect and run triage again); **BETA 33** answers the second live test: Collect states whose evidence it is collecting in a banner instead of a small row, and the workflow proposal is recreated on the new layout with the real screens (`review/2026-09-17/workflow-redesign-beta33.html`). See *What's new* in Help and the coverage table at the end. Every change carries a build number: the beta badge, the footer and Help's *What's new* read `BETA/js/build.js`; the live site was bumped to build 38 because `js/contain.js` (shared) changed. Built from the workflow advice and work package in `review/2026-09-16/` (WP-A to WP-D in one pass; desktop Connect/Collect split done now, as agreed). This note says what changed, what was verified where, and what you run and commit on the Mac.

## What the person sees

The sidebar is the step rail: **Start → Connect → Scope → Collect → Review → Respond → Hand over**, with the BETA 30 look (sidebar, top bar, case bar, panels) kept. The URL fragment names the step (`#/connect`, `#/case/<id>/review/findings?f=<finding>`), so the browser's Back button always returns to the previous screen and closes an open drawer. A reload reopens the same case on the same screen. Every screen has one primary action.

- **Start** — New investigation, Open a case (file or saved cases), Explore sample case. The app also offers *Continue last case*.
- **Connect** — web: *My organisation* or *Customer tenant · by domain*; the domain is resolved to its tenant ID through Microsoft's public OpenID configuration and the sign-in is pinned to it (`TriageGraph.setTenant` / `resolveTenant`). App: readiness check first, delegated user or customer profile, tenant domain/ID lookup, then one row per service (Graph required, Exchange optional) with *Sign in*, a waiting state and a result. Optional *Include email content* asks for `Mail.Read.Shared` at sign-in.
- **Scope** — one account or whole tenant, window, presets (*Quick*, *Standard*, *Everything*, *Custom*). Web suggests accounts from the tenant while typing. Presets and sources that need Exchange are greyed until it is signed in. Web offers *Save collection plan* for the app.
- **Collect** — (BETA 33) a green banner states the target first: *jan.devries@contoso.nl* **in** *contoso.nl* or *Whole tenant · contoso.nl*, with four facts under it — tenant (and ID), window (days and UTC range), sources (count and method), *Signed in as* the analyst (with Graph ✓ · Exchange ✓ while the app collects). It stays after the collection and on reopened cases. Then progress for the selected plan only, sources expandable to inspect arrived records, *Stop collecting*, the other steps locked; Review opens by itself when collection ends (analysis runs then).
- **Review** — Overview / Findings / Timeline / Evidence as rail sub-pages; findings and records open in a drawer (`.panel.drawer`) beside the list; review form with the same validation; *Contain this account →*; partial-set notice with *Resume incomplete sources* (web).
- **Respond** — the five phases; *Response session* row connects the account checks (web silently, app with one explicit window it announces); the shared runbook (js/contain.js) is embedded without its header (`opts.embedded`); the mailbox check uses the Exchange session from Connect.
- **Hand over** — checklist (unreviewed findings, phases without a decision, incomplete sources, armed containment), exports (case file, handover note, action log CSV), the full action log and a note field, *Start next investigation*.
- The case saves itself (app: evidence folder; web: IndexedDB) 1.5 s after each change; the case bar says *saving… / saved 14:05*. Help has a switch to turn that off.

## What changed underneath

BETA 33 (17 Sep, afternoon):

- `BETA/js/desk.js` — `collectionTarget(c)` renders the banner at the top of `viewCollect()`; a web collection creates the case with `scope`, `subject: { upn }` and `collectorAccount` (the signed-in analyst) so the banner is right from the first render and reopened cases name who collected; app: `connected()` and the rail's Connect line count a *collecting* service as signed in (the top-right button reads *Disconnect*, disabled, instead of *Sign in* while collecting); Review's four tabs use `stepEyebrow(5, "Review") + " · TAB"` instead of *Case workspace*.
- `BETA/js/collect.js` — resolves the affected account when the desk stated it without an object ID (`!ev.subject?.objectId`).
- `BETA/css/desk.css` — appended `.collect-target` block (green head, four-fact grid, stacks at ≤900/≤520 px). `BETA/js/build.js` build 33 entry; `BETA/index.html` `?v=33`, badge, footer; `package.json` / `desktop/package.json` 0.33.0; `desktop/main.cjs` collector string `Triage desktop 0.33.0`; `desktop/core.cjs` `BETA_BUILD` 33.
- `BETA/desk.dom.test.mjs` — two checks: the banner during a live web collection (account, tenant, sources, analyst) and on the reopened case after a reload without a sign-in (**157 / 157** here).
- `review/2026-09-17/workflow-redesign-beta33.html` — the proposal page recreated on the BETA layout: every frame is the real rendered markup of build 33 inside the real `desk.css` (scoped; light/dark toggle; container queries make the 390 px frame lay out as a phone), plus the corridor and sign-in diagrams redrawn as built, the navigation contract, the names table and a built / partial / open table. Regenerate with `node tools/workflow-page/capture-frames.mjs` (Playwright, synthetic data) then `node tools/workflow-page/make-workflow-page.mjs`.
- Docs — `BETA/docs/USER-GUIDE.md` (Collect banner), `BETA/README.md` (Beta 33 note).

BETA 31 / 32:

- `desktop/collector/collect.ps1` — `Read-Plan` reads the plan twice: at start (tenant, scopes) and after `Await-Collection` (affected account, window, sources; the tenant may not change). Graph: `Verifying tenant` → context written → wait → `Verifying affected account` → subject lookup → context rewritten with objectId/upn → optional Azure → queries. Exchange: tenant/operator check → context → wait → `Verifying mailbox identity` (Get-Mailbox, cross-checked against the Graph context when it already carries the object ID) → collection.
- `desktop/main.cjs` — connect-first session model: `triage:connect {caseId, service, tenantId, connection, mail}` allocates `cases/<caseId>/<attempt>`, writes a connection plan (tenant scope, no subject, every source the service may serve) and starts the retained worker; resolves when the worker reports `connected` with a verified context. `triage:cancel-connect`, `triage:sessions` (rows survive a renderer reload), `triage:collect(plan)` requires the same case/tenant/connection, rewrites `plan.json`, releases the connected workers, closes a signed-in service without selected sources, marks sources of an unsigned service failed (*not signed in*), cross-checks the Graph/Exchange object IDs, bundles as before and closes the link. 10-minute sign-in watchdog unchanged (`CONNECT_TIMEOUT`); 30-minute idle expiry for a signed-in worker (`SESSION_IDLE`). `trusted()` ignores the URL fragment. Collector string `Triage desktop 0.31.0`.
- `desktop/core.cjs` — `validatePlan` accepts an optional `tenantName` (≤200 chars); `BETA_BUILD` 31 in the evidence VM context. `desktop/preload.cjs` — `connect`, `cancelConnect`, `sessions`.
- `BETA/js/graph.js` — `setTenant`, `resolveTenant`, request-level authority in `loginPopup`/token calls, sign-in refused when it lands in another tenant than the pinned one.
- `BETA/js/desk.js` — rewritten on the beta-styled prototype: hash router, gates (`gateFor`), rail, seven views, drawers, autosave, route restore, native progress mapped to the Connect rows. `BETA/js/first-hour.js` — new Respond layout (rows around the embedded runbook). `js/contain.js` — `opts.embedded`. `BETA/js/desk-model.js` — new action-log types (`handover-exported`, `log-exported`, `response-connect`, `collection-error`). `BETA/index.html` (BETA 31, `?v=31`, WORKFLOW rail), `BETA/css/desk.css` (rail steps, drawer, service rows, checklist rows — appended block), `BETA/js/build.js` (build 31 entry), `package.json` / `desktop/package.json` 0.31.0.
- Tests — `tests/desktop.test.cjs` (+2 connect-first collector tests), `BETA/desk.dom.test.mjs` (rewritten, 152 checks), `tests/execution-ui.mjs`, `tests/oauth-scope-ui.mjs`, `tests/readiness-ui.mjs` (readiness lives on Connect now), `tests/desktop-connections.mjs`, `tests/desktop-progress.mjs`, `tests/desktop-timeout.mjs`, `tests/desktop-smoke.mjs` (rewritten for the rows), `tests/fixtures/desktop-connections.ps1` (`deny-exchange` file instead of the UPN trigger; re-reads the plan after release), `tests/fixtures/desktop-progress.ps1` (same).
- Docs — `BETA/docs/USER-GUIDE.md` rewritten around the seven steps; `BETA/README.md`, `BETA/docs/COLLECTOR.md`, `BETA/docs/CUSTOMER-CONNECTIONS.md` updated; `QUICK-USER-GUIDE.md` and `WALKTHROUGH.md` moved to `BETA/docs/legacy/` with a retirement note.

## Verified here (cloud sandbox, Linux)

- `node --test tests/desktop.test.cjs` with PowerShell 7.5.2 and the mocked modules: **21 / 21**, including the two new connect-first tests (plan completed after release resolves the account and filters queries; a plan that changes tenant after sign-in is refused before any read).
- `node BETA/beta.engine.test.mjs` and `tests/web-server.test.cjs`: pass. `tests/quick-safety.test.cjs` could not run here (it imports `backend/policy.js`, which was not copied into the sandbox tree) — it is unchanged and runs on the Mac.
- `node BETA/desk.dom.test.mjs` with Chromium: **157 / 157** (155 + the two BETA 33 banner checks) — rail and gates, Help, sample → Review, drawer + validation + Back/Escape, evidence and timeline drawers, Respond (embedded runbook, blast stop, phase decisions), Hand over (escaped notes, exports), responsive at 320/390/768/1024, web Connect (tenant lookup, pinned sign-in) → Scope (suggestions, presets, plan export) → Collect (live progress, records during collection, reduced motion) → Review, autosave + reload restore, new case, Open a case, disconnect, imported cases with gaps, directory/MFA regression, OAuth scope, analysis status, desktop readiness on Connect (stubbed bridge).
- A stubbed-bridge walk of the desktop surface in Chromium (Connect rows → Scope → Collect → Review) and screenshots of every screen were reviewed.
- Not run here: the four Electron tests (need the bundled runtime and `msedge`), and any live tenant.

## Run on the Mac (PowerShell)

```powershell
cd ~/REPO/triage
npm test
npm run test:browser
node tests/desktop-connections.mjs
node tests/desktop-timeout.mjs
node tests/desktop-progress.mjs
node tests/desktop-smoke.mjs
```

`desktop-smoke.mjs` reads `test-results/beta31-case.json`, which `npm run test:browser` writes, so keep that order. `desktop-progress.mjs` and `desktop-smoke.mjs` open the private viewer with the `msedge` Playwright channel (set `PLAYWRIGHT_CHANNEL=chromium` if Edge is not installed). Then walk it yourself:

```powershell
npm run web        # http://localhost:8080/BETA/ — Start → sample, or Connect with your account
npm run desktop:start
```

Things worth a real look in the app: the Connect rows with a real browser sign-in (Graph, then the optional Exchange row), that Scope only offers the mailbox after Exchange is signed in, that Collect opens with the green banner naming your tenant (devcf.onmicrosoft.com · whole tenant) and your account under *Signed in as*, that Collect opens Review by itself, and that the case bar says *saved* after a review. Open `review/2026-09-17/workflow-redesign-beta33.html` in a browser for the as-built walkthrough.

## Commit

The tree also holds the untracked BETA 24–30 work; commit that the way you planned. For this build:

```powershell
cd ~/REPO/triage
git add BETA/index.html BETA/css/desk.css BETA/js/desk.js BETA/js/first-hour.js BETA/js/graph.js BETA/js/desk-model.js BETA/js/build.js js/contain.js
git add desktop/main.cjs desktop/preload.cjs desktop/core.cjs desktop/collector/collect.ps1 desktop/package.json package.json
git add BETA/desk.dom.test.mjs tests/execution-ui.mjs tests/oauth-scope-ui.mjs tests/readiness-ui.mjs tests/desktop.test.cjs tests/desktop-connections.mjs tests/desktop-progress.mjs tests/desktop-timeout.mjs tests/desktop-smoke.mjs tests/fixtures/desktop-connections.ps1 tests/fixtures/desktop-progress.ps1
git add BETA/README.md BETA/docs review/2026-09-17/HANDOVER-BETA-31.md
git add js/build.js index.html
git add BETA/js/collect.js review/2026-09-17/workflow-redesign-beta33.html tools/workflow-page
git commit -m "BETA 33 / build 38: one workflow — Start, Connect, Scope, Collect, Review, Respond, Hand over" -m "Sidebar as step rail with a hash router; sign-in only on Connect (tenant pinned on the web, retained PowerShell sessions per service in the app); Scope presets; Collect opens Review; findings in a drawer; autosave and route restore. collect.ps1 reads the completed plan after release; main.cjs connect/collect session model; tests and guides updated. BETA 32: account checks reuse the sign-in, no repeated triage prompt, rail fits, session chip, What's new in Help. BETA 33: Collect states the target (account or whole tenant, tenant, window, sources, signed-in analyst) in a banner; web cases record the analyst; Review tabs carry the step eyebrow; the workflow proposal recreated on the BETA layout with the real screens (review/2026-09-17/workflow-redesign-beta33.html, tools/workflow-page). Live site build 38: contain.js embeddable (cache-busters)." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01E2FymZukpLWx53MvN1iCLx"
git push
```

## Decisions and known limits

- **Sessions are consumed by a collection.** The PowerShell worker exits after its collection; a second collection in the same case means signing in again on Connect (the rows say so). Keeping a worker alive for repeated collections is a later change to `collect.ps1`.
- **Review, Respond and Hand over are locked while collecting.** Records that have arrived can be inspected on Collect. A note during collection is not possible in this build; the action log carries the collection events automatically.
- **Read scopes are requested at sign-in for every source a service can serve** (so Scope can pick anything later). Mail content is the one opt-in on Connect. Azure sources still sign in after release (Scope says so on those sources).
- **The app's "My organisation"** is a domain or tenant ID field: the PowerShell connection needs the tenant GUID before the browser opens. The web resolves a customer domain the same way; *My organisation* there uses the `/organizations` authority.
- **The Respond row in the app still opens one Microsoft window** for the account checks (WP-41 remains open); the row says so before it happens.
- **A signed-in worker that is not released within 30 minutes is stopped** and its row asks for a new sign-in (`SESSION_IDLE`).
- `tenantName` is the domain typed on Connect; for *My organisation* on the web it is the account's domain. Reading the organisation's display name from Graph is a small follow-up.
- Electron tests were rewritten without being executed here; if a selector or timing needs adjusting on the Mac, the fixtures and `main.cjs` are the places to look, not the flow.

## Mockup coverage — `review/2026-09-16/workflow-redesign.html` checked against the build

Checked screen by screen and rule by rule after the first live test on 17 September (sidebar overflow, Respond asking to "connect" and "run triage" again).

| Mockup | Built | Notes |
|---|---|---|
| Header: rail with a status line per step | ✓ | Scope line reads *account · 7 d · 7 sources* (the preset name is not stored in the case, the source count is) |
| Header: case chip *account · tenant · records · Saved 12:04* | ✓ | case bar; *saving… / saved hh:mm / not saved yet* |
| Header: session chip *account · tenant · Graph ✓ Exchange ✓ · Write: not armed* | ✓ | added on 17 Sep; the breadcrumb is *Step n of 7 / name*, no longer static |
| Sign-in as rows with button, waiting state, elapsed time, result (app) | ✓ | Graph required, Exchange optional; cancel; 10-min watchdog |
| One MSAL card on the web, opened by its own button | ✓ | tenant pinned first (My organisation / customer domain) |
| Respond reuses the Connect session | ✓ web / ◐ app | web: silent, the *Account checks* row shows *Connected* on arrival (fixed 17 Sep); app: one Microsoft window, announced on the row (WP-41 removes it) |
| Routes `#/start … #/case/<id>/handover`, `?f=` / `?s=&r=` drawers, Electron `trusted()` on origin + path | ✓ | exactly as listed |
| Tenant GUID field disappears on the app | ◐ | replaced by *Tenant · domain or ID* with lookup: PowerShell needs the tenant before the browser opens; customer profiles fill it |
| Start: New investigation / Open a case / Try the sample / Continue last case (app) / desktop-app line (web) | ✓ | |
| Connect web / app wireframes incl. readiness, *Sign in as*, customer profiles, MFA note | ✓ | |
| Scope: One account / Whole tenant, lookback, account suggestions, Quick / Standard / Everything / Custom, evidence folder (app), desktop hand-off card + Save plan (web) | ✓ | evidence folder is a panel, not a collapsible |
| Collect: service ticks, x / y + %, *Collecting now · source*, rows, Stop, Collection details | ✓ | no per-source elapsed time (*query pending 0:45*); BETA 33 adds the target banner (account or whole tenant · tenant · window · sources · signed in as) above the coverage |
| Review: tabs, summary with partial-source resume, finding drawer with review form | ✓ | drawer's *Supporting evidence · n records* lists references only when the finding names records; the analyzers do not yet, so the drawer offers *Inspect <source> →* |
| Phone: rail as a sheet, drawer full screen | ◐ | the rail stacks like the BETA 30 sidebar; the drawer stacks under the list; Back closes it |
| Respond: phase track, affected account · change, session row, Arm card, steps, mailbox card, phase navigation, action log, note | ✓ | the runbook's own *Preserve the evidence… run triage first* card is hidden (the phase-1 rows cover it) |
| Hand over: checklist, three exports with saved state, Start next investigation | ✓ | |
| Rule 1 rail everywhere; completed steps navigate back, warning when that discards a collection | ✓ | starting a second collection asks first; the open case stays saved (added 17 Sep) |
| Rule 2 one primary button per screen | ✓ | |
| Rule 3 state in the hash; reload restores | ✓ | |
| Rule 4 dialogs never navigate | ✓ | Open a case / choose account select something, then the workflow continues |
| Rule 5 drawers are routes | ✓ | |
| Rule 6 sign-in on Connect only, step-up on Arm only | ✓ web / ◐ app | see Respond above |
| Rule 7 autosave and say so; `beforeunload` only when unsaved | ✓ | warns during collection or while a change is not yet written |
| Rule 8 no empty pages | ✓ | locked steps are greyed with the reason |
| Rule 9 one header on both surfaces | ✓ | |
| Rule 10 web and app differ on Connect and Scope only | ✓ | |
| Section 6 names | ✓ | *Start collection*, *Desktop app*, *Sign in*, *Respond* / *First 60 minutes*, *Open a case*, *Evidence*, *Help*; *Export case* and *Save* stay as explicit copies beside the automatic save |
| Section 7 phases A–D | ✓ | WP-40/41 unchanged |

The same table, redrawn on the built layout with the real screens: `review/2026-09-17/workflow-redesign-beta33.html`, section 6.
