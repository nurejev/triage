# Triage Beta 13 — test checklist

**Start here:** [Open the local Beta 13](http://localhost:8080/BETA/) → **Explore sample case**. Start with section 1 below; no Microsoft sign-in is needed for the sample.

Test reference: **Beta 13 · shared build 25 · desktop 0.13.0**. Created 15 September 2026. This is a testing document; the application build has not changed.

## Where everything is now

| Component | Verified state on 15 September | What to use for this test |
| --- | --- | --- |
| New website | Local files in `/Users/mihaimonte/REPO/triage`; Node is listening on `127.0.0.1:8080` and serves Beta 13. | [http://localhost:8080/BETA/](http://localhost:8080/BETA/) |
| Portable apps | macOS ARM64 and Windows x64 version 0.13.0 ZIPs are built locally. | Download links below, or the existing local Mac app. |
| GitHub source | Remote `main` is still commit `8fb921c5c8f5bdb208143ee27a3b5194a8ed315f` from 28 August. The new beta is uncommitted local work. | Do not clone GitHub expecting these changes yet. |
| Public website | [triage.limon-it.nl/BETA/](https://triage.limon-it.nl/BETA/) currently serves **Beta 2**, not this redesign. | Use localhost for Beta 13 acceptance. |
| Docker runtime | No running containers in the checked `desktop-linux` Docker context. The website and portable app do not require Docker. | Do not start Docker for this test. |
| Old Docker files/workflow | Dockerfiles, Compose files and the Docker publishing workflow remain. `.github/workflows/docker.yml` still runs on pushes to `main`. | This publishing route needs a decision/cleanup before publishing the new architecture. |

**Local does not mean offline collection.** The viewer, processing and case files run on your computer. Live collection connects to Microsoft 365 for sign-in and data. Opening/importing a case does not upload it to GitHub or a team server. Team upload is not implemented.

**Saving:** the web viewer stores one selected case in that browser's storage when you choose **Save on this device**. The native app stores the selected case locally and also writes acquisition folders for its collection attempts. Saving another case replaces the selected save slot, so export a JSON file for each investigation you want to keep. The web browser, native app and private local browser view do not share an automatic save slot.

## Before you start

Tester: ____________________  Date: ____________________

Mac/Windows version: ____________________  Browser: ____________________

Build shown: ____________________  Approved test tenant/account: ____________________

Result convention: tick a box only after the expected result is observed. Record failures or blocked tests in the results section. Keep tenant evidence in your normal evidence location; use sanitized details in this checklist if it will be committed to GitHub.

1. Finish any running collection, save/export the existing case, then refresh the local page. Confirm **BETA 13** in the sidebar.
2. Use the sample for section 1. For section 2, choose an authorized test account in a tenant you can inspect independently, and start with **Last 1 day** and a small set of sources.
3. Leave Unified Audit Log and tenant-wide collection until the basic account test works. They can take longer; selecting a long lookback cannot restore data Microsoft no longer retains.

The local website is already running. If it is unavailable later, start it from PowerShell and leave that terminal open:

```powershell
Set-Location '/Users/mihaimonte/REPO/triage'
npm run web
```

If port 8080 is already in use, first try the existing local page. Keep the registered `http://localhost:8080/` sign-in origin rather than changing ports for this test. The development server needs Node 24 or later; the portable app includes its own runtime.

## 1. Browser and sample case — approximately 10–15 minutes

- [ ] **T01 — Correct build and entry screen.** Open the local beta and choose **Explore sample case**. **Pass:** Beta 13 appears, the case is clearly marked as fictional, and the overview contains findings and evidence.
- [ ] **T02 — Evidence opens.** Click a source name, its count and its status; open an individual record. **Pass:** source records open in place, the original record is readable, and its reference is visible. An empty/uncollected source explains its state.
- [ ] **T03 — Review and timeline.** Open a finding, inspect its evidence, save a sample review with a valid reference, and inspect a dated timeline record. **Pass:** the review persists in the case and the timeline links back to the original evidence. A confirmed review without a reference is rejected.
- [ ] **T04 — Theme and layout.** Select System and change the operating system between light/dark while typing an unsaved runbook note. Then try fixed Light and Dark, and a narrow browser window. **Pass:** System switches automatically; text and focus survive; fixed choices stay fixed; controls remain reachable without horizontal page scrolling.
- [ ] **T05 — First-hour guide and action log.** On the sample, add an in-progress runbook outcome, then a correction. Try Verified without a reference. **Pass:** both entries remain in the UTC action log; verification requires an existing reference. This tests recording, not execution of a tenant response.
- [ ] **T06 — Save and handover.** Save the sample, export its JSON, action-log CSV and Markdown handover. Reload and use **Open saved case**, then import the exported JSON. **Pass:** the same case ID, source record counts, reviews and prior log entries remain; an extra case-open/export entry is normal.
- [ ] **T07 — Start another case.** With the sample open, choose Quick web check → **Save & start new case**. **Pass:** a prominent central action starts a fresh form; the saved previous case can still be reopened. Export before overwriting that save slot with another case.

**Continue to live collection after T01–T07 pass.**

## 2. Live web collection — approximately 15–30 minutes

Use an authorized test account. The web beta uses the existing Triage application registration; you do not need to create another registration just to start this test. Tenant consent, your delegated roles, licensing and available retention must allow the selected sources. See the [collector and permissions guide](../../BETA/docs/COLLECTOR.md).

- [ ] **T08 — Connect and choose the target.** Connect Microsoft 365. **Pass:** Account to check fills with the connected username, stays editable, and Run quick check is beside it. If you enter another authorized target, reconnecting preserves that target.
- [ ] **T09 — Small collection.** Select Last 1 day, User inventory and Interactive sign-ins; optionally add Non-interactive sign-ins and Directory changes. Run. **Pass:** the intended tenant/account is collected; the target inventory is correct; sign-in records belong to the affected user. Application inventory and tenant-wide OAuth consent can legitimately contain shared context in later tests.
- [ ] **T10 — Progress and gaps.** Watch Overview while collecting and inspect All sources afterwards. **Pass:** the denominator matches selected sources; collecting/waiting/complete are distinct; unselected sources are separate; an unstarted request is not shown as a zero-record result. Failed, unavailable or partial sources retain an explanation.
- [ ] **T11 — Compare with Microsoft.** Compare several sign-in IDs, UTC timestamps and outcomes with the corresponding Microsoft records using the same account and time window. Compare current account state with User inventory. **Pass:** the sampled records agree; scope, paging or retention differences are recorded rather than assumed to be clean results.
- [ ] **T12 — Add the remaining Graph sources.** In a fresh test case, add directory changes, risk sources, OAuth grants, application identities, devices, roles and MFA as appropriate to your authorized access. **Pass:** each selected source returns data or a clear access/licensing/collection outcome. OAuth collection no longer reports the old “Only Equals comparison” OR-filter error. A missing permission is an environment gap, not a successful complete collection.
- [ ] **T13 — Cancel and resume in the same browser session.** Start a fresh multi-source test, cancel after evidence arrives, then use Evidence → Resume incomplete web sources. **Pass:** records already collected remain; completed sources stay complete; unfinished work continues without losing earlier records. Do this before importing/reloading a case; imported cases and desktop resume are outside this test.
- [ ] **T14 — Account/tenant separation.** Export the live case, start another quick triage and select the next authorized target. **Pass:** the new case has a new ID and the right subject; previous evidence does not appear in the new case.

**Optional later:** run Unified Audit Log alone on a small interval, then tenant scope. Verify returned audit records and scope independently. An audit query may outlast the first hour; do not mark it complete merely because the runbook reached 60 minutes.

## 3. Portable macOS app — approximately 20–40 minutes

[Download the current macOS ARM64 ZIP](http://localhost:8080/BETA/downloads/Triage-macOS-arm64.zip). Extract it and retain the complete `Triage.app` bundle. Your M4 Mac uses this ARM64 build.

For a quick check of the already-built local application:

```powershell
open '/Users/mihaimonte/REPO/triage/desktop/out/Triage-darwin-arm64/Triage.app'
```

- [ ] **T15 — Downloaded launch.** Test the extracted download as well as the already-built app. **Pass:** Triage opens and shows Beta 13 without an installer. Record any macOS first-launch block separately; this build is ad-hoc signed, not Developer ID signed or notarized. See the first-launch note below.
- [ ] **T16 — Runtime readiness.** Choose Check desktop readiness. **Pass:** bundled PowerShell and required modules report ready without installing them globally.
- [ ] **T17 — Delegated native collection.** Enter the target tenant ID and account before connecting; collect the same small Graph set as T09. **Pass:** Microsoft sign-in completes, identity matches the requested tenant, collection finishes and the shared viewer opens the results. Compare selected records with the web case; account for differing collection windows.
- [ ] **T18 — Mailbox evidence.** For an authorized test mailbox, add Mailbox configuration snapshot and complete the separate Exchange sign-in. **Pass:** existing forwarding, inbox rules, delegates and audit settings agree with a read-only independent check; per-command failures are visible. Existing configuration is unchanged. Empty results are acceptable where independently confirmed.
- [ ] **T19 — Move a case between viewers.** Save/export the native case, open it in the local web viewer, and try **Open this case in local browser** from the app. **Pass:** case ID, raw records, source states and prior log entries agree. Keep the app running for its private browser URL; that URL is local to the machine and is not a team-share link.
- [ ] **T20 — Restart.** Save the case and theme choice, close and reopen Triage, then use Open saved case. **Pass:** saved evidence, review history, action log and theme survive the restart. Desktop resume is not implemented; this is a saved-case restoration test.

### macOS first-launch note

Use the current ZIP, not the old Beta 8 download. Apple's **System Settings → Privacy & Security → Open Anyway** may be available after a blocked launch. The previously discussed per-app quarantine workaround can also be used for this trusted local beta. For an app extracted directly into Downloads, these are PowerShell commands:

```powershell
$triageApp = Join-Path $env:HOME 'Downloads/Triage.app'
/usr/bin/codesign --verify --deep --strict "$triageApp"
if ($LASTEXITCODE -ne 0) {
    throw 'Invalid app signature. Replace this copy with the current Triage build.'
}
/usr/bin/xattr -dr com.apple.quarantine "$triageApp"
/usr/bin/open "$triageApp"
```

Adjust the path to the actual extracted app. The command removes only that app's quarantine attribute; it does not repair an invalid signature or provide Developer ID trust. Record whether launch required this step. [Apple's first-launch guidance](https://support.apple.com/en-us/102445).

## 4. Portable Windows app — separate Windows computer

[Download the Windows x64 ZIP on this Mac](http://localhost:8080/BETA/downloads/Triage-Windows-x64.zip), then transfer the ZIP through your normal approved channel. Extract the entire archive into a folder on Windows and open `Triage.exe` from that folder. No Node server, Docker or separately installed PowerShell should be required.

**`localhost:8080` on Windows refers to Windows, not this Mac.** The Mac development server only listens locally. Use the transferred portable app and its own viewer for this test.

- [ ] **T21 — Windows launch/readiness.** Open the extracted version 0.13.0 and check readiness. **Pass:** the viewer and bundled runtime work. Record any Windows unsigned-publisher/SmartScreen block; native Windows acceptance is still outstanding.
- [ ] **T22 — Windows collection and persistence.** Repeat T17–T20, including delegated Graph/Exchange, case transfer and app restart. **Pass:** the same evidence and persistence expectations hold. Record the Windows version and authentication method used.

## 5. Results and acceptance

- [ ] **T23 — Account for every selected source.** Record which sources passed comparison, which were empty, and which were blocked by permissions, licensing, retention or errors. **Pass:** no unexplained omission is represented as complete evidence.
- [ ] **T24 — Preserve the test result.** Keep the case export and a short issue report for each failure. **Pass:** the issue contains test ID, build, OS/browser, expected/actual result, source name and exact error; use sanitized screenshots outside the evidence store.

| Test ID | Pass / Fail / Blocked / Not run | Actual result or issue reference |
| --- | --- | --- |
| | | |
| | | |
| | | |
| | | |

**Collection/viewer pilot accepted when:** the sample/save tests pass, selected live sources are verified or their gaps are explicitly recorded, no case identity/data-loss issue remains, and each platform being offered has actually been tested.

**Not yet full incident-response acceptance:** the redesigned first-hour runbook records manual outcomes. The original executable containment controls have not been migrated. Team upload and desktop collection resume are also unimplemented. These are known product gaps, not hidden passing tests.

## What has already passed

The recorded Beta 13 validation contains **99 browser checks**, **38 analyzer/import assertions**, **52 unit/script checks**, macOS app/runtime/save/restart checks, and both archive integrity checks. Mac signing was verified before and after ZIP extraction and the extracted app launched. Windows was cross-built but has not been run on Windows. These controlled checks do not replace the live-tenant and manual checks above.

[Detailed validation](BETA-13-COVERAGE.md) · [Full validation history](../../BETA/docs/VALIDATION.md)

Optional automated rerun from PowerShell on this Mac, with the local website running:

```powershell
Set-Location '/Users/mihaimonte/REPO/triage'
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:BETA_BASE_URL = 'http://localhost:8080'
npm run test:browser
node tests/desktop-smoke.mjs
```

The default checks use controlled fixtures and do not start Docker. The native smoke check temporarily saves a test case and preference and restores the previous saved files afterwards; run it outside your manual test session.

## Before publishing to GitHub

The checklist and Beta 13 changes are local. No commit, push or deployment was performed for this testing handover.

1. Complete the applicable manual tests and record the remaining gaps.
2. Review the accumulated local changes before committing; the checkout contains more than this checklist.
3. Retire or deliberately retain the old Docker publishing workflow before pushing to main. It still automatically publishes container images today.
4. Publish the static website and portable downloads through the chosen release process. The ZIPs are ignored by Git, so pushing the source alone does not publish the desktop apps. Recheck the public build marker after deployment.

Verification sources: live local build marker, local listener, Docker `desktop-linux` container listing, `git ls-remote origin HEAD refs/heads/main`, [GitHub source](https://github.com/nurejev/triage), and the [public build marker](https://triage.limon-it.nl/BETA/js/build.js). Remote main was `8fb921c`; public beta was build 2 at this check. No runtime or publication settings were changed.
