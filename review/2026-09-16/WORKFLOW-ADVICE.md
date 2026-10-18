# Triage — workflow advice: one flow a human can follow (2026-09-16)

Scope: the uncommitted working tree of `~/REPO/triage` at BETA 30 / desktop 0.30.0 (16 Sep, ~13:30). Read in full: `BETA/index.html`, `BETA/js/desk.js` (1,757 lines, the whole UI), `desk-model.js`, `first-hour.js`, `coverage.js`, `graph.js`, `collect.js`, `evidence.js`, `desktop/main.cjs`, `desktop/collector/collect.ps1` and `response.ps1`, the main site's `index.html` + `js/contain.js`, the four BETA docs, and the Playwright screenshots in `test-results/`. Diagrams and wireframes for everything below are in the published page **Triage Flow Redesign** (https://claude.ai/artifact/2jGokbDZchR6Q4oAePK2kP; the same HTML is saved as `review/2026-09-16/workflow-redesign.html`). The layout reference is the clickable prototype **Triage Beta Flow** (https://claude.ai/artifact/V7zbfCs6w2ztjvsk4bqBQS; standalone copy `review/2026-09-16/triage-beta-prototype.html`): the seven steps inside the BETA 30 shell, built on the beta's own `desk.css` — sidebar, topbar, case bar, page heads, panels, source rows, phase track and runbook cards unchanged. (An earlier draft with a top rail, `triage-prototype.html`, is superseded; keep the flow, not that look.) The work package is `WORK-PACKAGE-WORKFLOW.md` next to this file.

## 1. The short version

The BETA has become a dashboard with a sidebar, and a dashboard is the wrong shape for an incident tool. An analyst who opens it under pressure has to answer four questions that the screen does not answer: where am I, what do I do now, how do I get back, and will I lose what I have. Nine sidebar destinations are visible from the first second (six of them are empty until a case exists), sign-in happens as a side effect of pressing *Run*, the desktop app opens the browser two to four times without a screen that says so, clicks inside dialogs jump to other pages, the browser Back button leaves the site, and the same thing has two or three names.

The fix is not a restyle. Turn the BETA into **one guided procedure with seven steps** — *Start → Connect → Scope → Collect → Review → Respond → Hand over* — with a step rail that is always visible, exactly one primary action per screen, a router so that Back/Forward and reload work, and autosave so nothing is lost. Almost every render function that exists today survives; what changes is the frame around them and the order in which a person meets them. The main site (`triage.limon-it.nl`, `index.html:46-210`) already has this shape — *login → what do you need → who → collecting → report → contain* — which is why it feels simpler than the BETA even though it does less.

## 2. The flow today, as a person experiences it

### 2.1 Web (triage.limon-it.nl/BETA/)

You land on **Start** (`desk.js:309`): a landing page with three hero cards (*Quick web check*, *Portable collector*, *Open a case*), a "See it in a sample" strip and two explanatory panels. Left of it, the sidebar (`desk.js:83-93`) already lists *Start, Overview, Findings, Timeline, Evidence, First 60 minutes, Action log, Portable collector, Help · coverage*. Click any of the six case pages now and you get the same empty state, "Start with the evidence" (`desk.js:280-295`). Top right there is a *Connect Microsoft 365* button (`index.html:58-61`) that you may or may not press — nothing tells you whether you should.

*Connect & collect* opens **Quick web triage** (`desk.js:498-512`): one form with scope, lookback, *Account to check*, *Run quick check*, a method card and an eight-item evidence checklist, next to a "What happens next" panel that ends with *Open portable collector →*. If you did not sign in, pressing *Run quick check* opens the Microsoft popup (`desk.js:1079` `if (!G.account) await G.signIn()`) — sign-in as a side effect of "run", which is the moment most people think the page is broken because the popup appears behind the window or is blocked.

While collecting, the page jumps to **Overview** (`desk.js:1115`), a pill appears at the top of the sidebar with *Stop scanning*, and the execution strip shows the source being read. When collection ends, Overview shows four stat tiles, the top six signals, coverage, a *First 60 minutes* card and *Latest activity* — with five different exits (*Inspect evidence →*, *View all →*, *All sources →*, *Continue the runbook →*, *Open action log →*) and no "next step".

From here the person is on their own with the sidebar. A finding opens a **modal dialog** with the review form plus two buttons that leave the dialog and change the page underneath it: *Inspect supporting source →* closes the dialog and jumps to Evidence with the source expanded (`desk.js:1550-1551`), *Response & first-hour checks →* jumps to First 60 minutes (`desk.js:1548`) and, on the web with no matching sign-in, throws "Connect to this case's tenant before response" (`desk.js:896`). Coming back to the finding means: sidebar → Findings → scroll → click again.

**First 60 minutes** (`first-hour.js`) is the five-phase runbook. Inside phase 2 the main site's containment cards (`js/contain.js`) are rendered and filtered by phase, complete with the main site's own header: *Containment · user · ← Other account · Action log CSV · Handover report* (`contain.js:739-747`). *← Other account* calls `TriageApp.containSearch()` which in the BETA just re-renders the runbook (`desk.js:901`) — the button does nothing. *Back to the report* (`contain.js:782`) goes to Findings, a page called "report" nowhere in the BETA. The page head has its own *Export handover ↗* (`first-hour.js:29`, produces `M.handover`) while the contain header's *Handover report* produces a different Markdown file (`contain.js:747`). Two handovers, two action-log exports.

**Portable collector** in the sidebar is a download page (`desk.js:513-528`) whose primary button *Prepare a collection plan →* opens a **dialog containing the full desktop form** including a *Target tenant ID* GUID field (`desk.js:1425-1427`, `form(true)`); *Save collection plan* downloads a JSON that the desktop app can open only through the menu item *Triage › Open collection plan…* (`main.cjs:999-1015`). Nothing on either side tells you that. Meanwhile pressing *Run full triage* on the web also downloads a plan (`desk.js:1438-1447`). Two ways to make a file nobody knows what to do with.

Starting the next case: *New case* lives in the case bar, not in the sidebar; *Start* in the sidebar shows the marketing landing page again although a case is open (the case bar stays, the page reads as if you had just arrived).

And the one that costs real work: the app keeps its whole state in a `page` variable (`desk.js:39`) and never touches `history` (no `pushState`/`hashchange` anywhere in `desk.js`). The browser Back button leaves the site. `beforeunload` only warns while collecting (`desk.js:1561-1565`), so Back, reload or a closed tab after collection silently drops an unsaved case. On the web nothing autosaves.

### 2.2 Desktop app

The app opens directly on **Collect · full triage** (`desk.js:39` `page = N ? "collector" : "home"`): the same form, now with an *Evidence folder* card, a *Microsoft 365 connection* picker (delegated / customer certificate), a **Target tenant ID** GUID you must type before you can sign in (`desk.js:459`; `desk-model.js:309-310` rejects the plan without it), the account, *Run full triage*, and a 34-item checklist. The top-right button is *Check desktop readiness* (`desk.js:251-257`) — a pre-flight that is also a button inside the panel (`desk.js:510`) and that `acquire()` runs anyway before every collection (`main.cjs:213-218`). The analyst is asked to press a self-test button for no reason.

Then the part that generated the "browser says success, app keeps waiting" report. *Run full triage* → page jumps to Overview → status *Checking collection readiness…* → status *Connect Microsoft 365 in your browser. Microsoft may request consent or MFA.* (`main.cjs:371-375`) → the **default browser opens by itself** (`collect.ps1:112` `Connect-MgGraph -Scopes …`) → you sign in there → back in the app, if you find it, the Graph row says Ready → status *Connect Exchange Online using Sign-in options → Face, fingerprint, PIN or security key. Choose the same operator account as Graph.* → the **browser opens again** (`collect.ps1:185` `Connect-ExchangeOnline`) → sign in again → collection starts. Later, in Respond, *Connect account checks* starts `response.ps1`, which runs **a third** `Connect-MgGraph` (`response.ps1:13`), and the first write action after *Arm* — *Revoke sessions*, say — reconnects **a fourth time** with the write scopes (`response.ps1:10-13`): a sign-in window in the middle of executing a containment step. Four browser windows in one case, each announced only by a line of status text at the top of a dashboard the user is not looking at, because they are looking at the browser.

None of this is a bug in the sense of the code being wrong — the sessions are verified, the tenant is checked, the states are logged. It is a bug in the sense that the person has no screen for what is happening to them.

### 2.3 Documentation

`BETA/docs/USER-GUIDE.md` starts at `tenant.html` and describes *Collect evidence / Investigate / Response plan* and a Docker mailbox worker; `QUICK-USER-GUIDE.md` calls itself "Beta 6"; `WALKTHROUGH.md` is the Docker collector setup. None of them describes BETA 30. The in-app *How it works ↗* is a three-paragraph dialog (`desk.js:1552-1556`). There is no in-product answer to "what do I do next".

### 2.4 Vocabulary

One product, one thing, several names: *Quick web check / Quick web triage / Run quick check / Connect & collect* (all the web collection), *Full app triage / Run full triage / Collect · full triage / Portable collector / Open collector / Prepare a collection plan / Prepare a desktop collection* (all the desktop collection), *First 60 minutes / Continue the runbook / Response & first-hour checks / Respond / Connect account checks / Choose account / Arm containment* (all the response), *Open evidence / Choose evidence / Open a collected case / Open saved case / Inspect evidence / All sources* (all opening evidence), *How it works / Guide / Help · coverage* (all help). Each of these is a decision the reader has to make.

## 3. The target: seven steps, one rail

The principle: **Triage is a procedure, not a workspace.** The person is walked through it; the tool remembers where they are; every screen has one obvious next action; going back is always possible and never destructive without a warning.

```
①  Start   →  ②  Connect  →  ③  Scope  →  ④  Collect  →  ⑤  Review  →  ⑥  Respond  →  ⑦  Hand over
```

Steps 1–4 are a wizard (one screen each, Back / Next). Steps 5 and 6 are working areas with sub-pages (Review: Overview · Findings · Timeline · Evidence, as sidebar sub-items; Respond: the five first-hour phases that already exist). Step 7 is a checklist with the exports. **The rail is the existing sidebar**: the *WORKSPACE* nav becomes *WORKFLOW* with the seven steps, each in the current nav-button style with the step number in the icon slot (✓ when done, filled when current, dashed when not yet available) and a one-line status under the name: *Connect · analyst@contoso.nl*, *Collect · 11 / 12 complete*, *Respond · 2 / 5 phases*. Review expands into its four sub-items; *Help · coverage* stays below the rule; the *Evidence stays with you* block stays. Topbar (breadcrumb now reads *Step n of 7 · Name*; theme; account badge; the button is *Sign in* → goes to Connect, or *Disconnect*), case bar (subject · records · *saved 12:04* / *unsaved changes* · Export / Save / New case) and the execution strip stay exactly as they are. On a phone the beta's horizontal nav strip does the same job. Completed steps are clickable; future steps are disabled with the reason on hover ("Connect first").

### ① Start

Three choices and nothing else: **New investigation** (primary), **Open a case** (file, or the saved-cases list — always the list, not "list only when more than one", `desk.js:1288-1305`), **Try the sample**. The app adds **Continue last case** when a saved case exists. Below, one quiet line: *Get the desktop app* (web) — the only place the download lives. No hero copy, no explanation panels, no sidebar. With a case open, Start is not reachable from the rail; *New investigation* in the case chip replaces it and goes through the existing save-first panel (`desk.js:461-463`, keep it).

### ② Connect

The step that fixes the sign-in problem, on both sides, by making sign-in **a screen of its own that says what is about to happen and shows what happened**.

Web: a card *Sign in with Microsoft* → popup → the card turns into the result: account, tenant name, tenant ID, "read-only permissions granted", *Disconnect*. *Next* becomes enabled. The top-right *Connect Microsoft 365* button goes away; the header shows a status chip instead (account · tenant). Nothing else ever triggers `G.signIn()` — `webCollect()` must throw if not connected rather than sign in (`desk.js:1079`).

App: the readiness check runs automatically when the screen opens (progress inline, no button), then two service rows:

- **Microsoft Graph — required.** *Sign in* → the row shows *Waiting for you in your browser… 0:12 · Cancel* (the browser opens when the person presses the button, not before) → ✓ account, tenant.
- **Exchange Online — optional.** One line of explanation (*needed for mailbox rules, forwarding, delegates, message trace*) and its own *Sign in*. Skipping it hides the Exchange sources in Scope with the note "Connect Exchange Online to enable".

Above the rows, *Sign in as*: the delegated analyst (default) or a customer certificate profile; the profile manager and the registration wizard (`customerAction`, `desk.js:361-450`) become a *Manage…* link on this screen and nowhere else. With a certificate profile the rows say *Authenticating with certificate…* and there is no browser at all. The tenant: a profile carries it; for delegated sign-in the person chooses *My organisation* or types the customer's **domain** (`contoso.com`), which the page resolves to the tenant ID and name through the public OpenID configuration before sign-in — the GUID field (`desk.js:459`) goes, but the tenant is still pinned before the browser opens, which partner accounts need (`Connect-MgGraph -TenantId`; on the web this also closes WP-32's authority pinning). The plan still carries `tenantId`; the screen fills it.

Under the hood this is the split of `collect()` into `connect()` and `collect()` in `main.cjs`: the workers already start with `-WaitForCollection` and block on the `collect` release line (`main.cjs:377-389`, `487`); they only need to be started at step ② and released at step ④, with an idle timeout that sends the person back to ② ("Your Graph session ended — sign in again") instead of failing inside a collection. Scopes: the Graph worker connects at ② with the base read scopes plus the extras every source needs *except* `Mail.Read.Shared` (`collect.ps1:109-111`); choosing *Email content / attachments* in Scope announces one extra sign-in on the Collect screen. Once WP-41 (msal-node token hand-off) lands, this screen shows one *Sign in* and the Exchange row inherits the account silently — the screen does not change, only the number of browser windows.

Respond's *Connect account checks* and *Arm* should reuse the ② session instead of opening `response.ps1` with a fresh interactive `Connect-MgGraph` (`response.ps1:11-13`). Until msal-node exists, at least present them the same way: a row with a button, a "waiting in your browser" state and a result — never a status line.

### ③ Scope

*Who and what.* **Investigation scope**: *One account* with an **account picker that suggests users from the tenant** as you type (port `upnInput`/`upnSugg` from `js/app.js`; the main site already does this) or *Whole tenant*. **Lookback** (7 days default). **Evidence preset**: *Quick* (Graph core, minutes), *Standard* (Graph + mailbox snapshot; app only), *Everything* (all 34 sources, with the duration and mail-content warning), *Custom* (expands today's checklist, collapsed by default). App only, collapsed under *Where evidence is stored*: the evidence folder controls (`storageControls`, `desk.js:452-454`). Primary button: **Start collection →**. Web only: when the person picks something that needs the app, an inline card *Continue in the desktop app* with three numbered lines — download, open, *Open a plan* — and the *Save plan* button; the Portable collector page and the plan dialog disappear.

### ④ Collect

A single-purpose screen: the connection rows (Graph ✓ · Exchange ✓), the source list with the existing states and icons (`sourcePresentation`, `desk.js:581-654`), the progress bar, the *Collecting now · …* line, one **Stop** button. No stat tiles, no signals, no runbook card while collecting — those belong to ⑤. When collection ends the same screen shows *Analyzing…* and then advances to ⑤ by itself with a toast (*Collection finished · 11 / 12 sources complete, 1 partial*). Partial or failed sources produce a banner at the top of Review with *Resume* (web, `webCollect(true)`) or *Collect again* (app) — the person never has to hunt for "Resume incomplete web sources" in the Evidence header (`desk.js:865-867`).

### ⑤ Review

Tabs inside the step: **Overview** (the tiles, top signals, coverage — today's `overview()` minus the runbook and activity cards), **Findings**, **Timeline**, **Evidence**. The finding detail becomes a **side drawer** instead of a modal (`desk.js:1585-1592`): the finding, its review form, and a *Supporting evidence* section that lists the source's records **inside the drawer** (reuse `sourceDetails`, `desk.js:716-742`) — no page jump. A record opens *in* the drawer as a second level with a *← Back to finding* link. Closing the drawer returns to the same scroll position; the browser Back button closes it. The Review header carries the step's one primary action, **Respond →**; a finding's drawer carries *Contain this account →* which goes to ⑥ with the account preselected (today's `openResponse`, minus the dialog for tenant scope, which becomes the picker on ⑥'s first phase).

### ⑥ Respond

The five phases stay (`desk-model.js:5-111`, `first-hour.js`), entered from ⑤. Changes: phase 1's checks tick themselves from case data (account confirmed, tenant confirmed, coverage, *Export starting point* one click); the contain.js header (`← Other account`, `Back to the report`, `Handover report`, `Action log CSV`) is suppressed in the BETA (`TriageContain.start(user, {embedded: true})`), leaving **one** handover export (⑦); *Connect account checks* and *Arm containment* are presented as the rows from ② — with the explicit sentence "This opens a Microsoft permissions window" on Arm, which is the one step-up in the whole flow. The tenant-wide case's *Choose the affected account* dialog (`desk.js:891`) becomes the first control on phase 2, inline.

### ⑦ Hand over

A checklist, not a page of exports: findings reviewed *x / y* (link back to the unreviewed ones), phases reviewed *x / 5*, sources with gaps, then the three exports (**Case file** JSON, **Handover** Markdown, **Action log** CSV) with "saved to …" confirmations, and **Start next investigation**, which saves and returns to ①.

## 4. Navigation rules — the contract every screen obeys

1. The step rail is on every screen; the current step is highlighted; future steps are disabled with a reason; completed steps navigate back (with a warning when going back would discard a collection).
2. Every screen has one title, one line of what to do here, **one primary button** (the step's exit), one *Back*. Everything else is secondary or tertiary.
3. State lives in the URL hash (`#/start`, `#/connect`, `#/scope`, `#/collect`, `#/case/<id>/review/findings?f=<findingId>`, `#/case/<id>/respond/contain`, `#/case/<id>/handover`). Browser Back/Forward work; reload restores the case from autosave. Electron: hash changes do not fire `will-navigate` (`main.cjs:677` stays), but `trusted()` must compare origin + pathname, not the full frame URL (`main.cjs:78-85`) or every IPC call fails once a hash is present.
4. Dialogs confirm or collect a short form; they never navigate. No button in a dialog changes the page under it.
5. Details open in a drawer; the drawer is a route (`?f=`, `?r=`); closing it is Back.
6. Sign-in happens on ② only; the write step-up happens on ⑥ *Arm* only; both are rows with a button, a waiting state with elapsed time and a result. Never a status line, never a side effect of another button.
7. Autosave: every mutation of the case (collection result, review, note, phase outcome) is written debounced to IndexedDB (web) or the evidence folder (app); the case chip shows *Saved · 12:04* or *Unsaved changes*; `beforeunload` warns only when unsaved.
8. No empty pages. If a step cannot be shown yet it is disabled, not rendered with an empty state.
9. The shell is the beta's shell on web and app: sidebar rail · topbar (breadcrumb *Step n of 7 · Name*, theme, account badge, Sign in / Disconnect) · case bar (subject · records · save state · Export / Save / New case) · execution strip. Nothing is added to the chrome except the step numbers, the status lines and the sub-items.
10. Web and app differ only on ② and ③ (how you sign in, which evidence exists). Everything from ④ on is identical.

## 5. Names

| Today | Target |
|---|---|
| Quick web check, Quick web triage, Run quick check, Connect & collect, Full app triage, Run full triage, Collect · full triage | **Start collection** (③'s button); the difference is the *Evidence preset* |
| Portable collector, Open collector, Prepare a collection plan, Prepare a desktop collection | **Desktop app** (a card on ③ and a line on ①) |
| Connect Microsoft 365, Check desktop readiness, Connect account checks | **Sign in** (②), readiness is automatic, response reuses ② |
| First 60 minutes (nav), Continue the runbook, Response & first-hour checks, Respond | **Respond** (⑥); *First 60 minutes* stays as the title inside it |
| Open evidence, Choose evidence, Open a collected case, Open saved case | **Open a case** (①) |
| Inspect evidence, All sources, Inspect supporting source | **Evidence** (⑤ tab / drawer section) |
| How it works, Guide, Help · coverage | **Help** (one link in the header; coverage contract inside it) |
| Export case, Save on this device, Save to evidence folder | **Save** (autosave; the chip shows the state) and **Case file** export on ⑦ |

## 6. What stays

The redesign is a re-framing, not a rewrite. Keep as they are: `sourcePresentation` / `coverageSummary` / `sourceRows` (the coverage model is good), the review validation (`validateReview`), the drafts map, `desk-model.js` phases and the action log, the saved-cases-per-case store, the evidence folder, customer profiles, the first-hour phase filter, the collection engines (`collect.js`, `collect.ps1`), the bundle format. The main site's account picker and its progress screen are worth porting rather than reinventing.

## 7. Order

Do the frame first (router, rail, ①–④), because it changes what every later screen assumes; then ⑤/⑥ (drawer, embedded runbook, one handover); then autosave and the header chips; then the naming sweep and the docs. WP-40/41 from the BETA 23 package are unchanged and slot into ② without changing its layout. Details, files and acceptance per item are in `WORK-PACKAGE-WORKFLOW.md`.
