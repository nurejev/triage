# Beta 19 — visible collection and analysis method

Date: 2026-09-15. Shared build 31; desktop 0.19.0. Local development candidate.

## Changes

- The shared collection form names the execution method near the account and Run controls: **PowerShell** on this computer in the portable app, or **Browser JavaScript** in the web client.
- A sticky, accessible status strip identifies active collection, cancellation and JavaScript analysis across case screens. When finished, it explicitly identifies the current viewer and says **no checks running**. Icons, labels and theme-aware colors provide the distinction together.
- Native collection uses the existing bundled PowerShell runtime. Both viewers use the existing JavaScript analysis worker. This change labels that behavior; it does not alter collection permissions or query scope.
- New cases record their collection method in the case metadata, collection-start action log and handover. Save/export and the native-to-browser handoff preserve it. Legacy cases without metadata report **not recorded**, and the current viewer never supplies a guessed historical collection method.

## Verification

- **136 browser checks passed**, including Browser JavaScript setup/live collection, navigation, saved-case method, explicit JavaScript analysis and legacy-case handling. Existing coverage, OAuth-scope, evidence, review-validation, export and theme checks also passed.
- **48 native UI checks passed** using the real Electron host/preload, isolated profile and bundled PowerShell with synthetic collection fixtures. Checks cover PowerShell setup/live progress, authoritative case metadata, browser handoff, JavaScript analysis and legacy imports.
- **15 model/native-script tests passed**. Syntax and Git whitespace checks passed. This UI/metadata update did not rerun the full analyzer/import suite or broader desktop readiness test; earlier results remain below.
- The analysis-status helper briefly gates the real analysis worker to observe the pending phase, then releases it into the actual analyzer without replacing its result.
- Browser/native setup, collection and analysis screenshots were visually inspected. Tests use fictional evidence; no Microsoft tenant was contacted and the user's active case was not changed.

Evidence: `test-results/beta19-browser.log`, `beta19-native-progress.log`, `beta19-unit.log`, `beta19-web-execution.png`, `beta19-native-running.png`, `beta19-native-analysis.png`.

## Quick acceptance checklist

1. Export the active case before refreshing the website or replacing the portable app. Confirm **BETA 19** after reopening.
2. In **Quick web check**, verify **Collection method: Browser JavaScript** below the account and Run controls. Start a check and verify the top strip says it runs in this browser.
3. In the portable app, verify **Collection method: PowerShell**. Start a check and verify **Collecting with PowerShell · Runs on this computer**. Open Evidence or the runbook while collecting; the strip should remain visible.
4. When collection ends, verify the status changes to **Analyzing evidence with JavaScript**, then **App viewer** or **Browser viewer · no checks running**. Analysis may be brief with small cases.
5. Save a portable case and open it in the browser viewer. Verify it still records **PowerShell** as the collection method while clearly identifying the current browser viewer.
6. Open a case exported before this change. Verify its collection method is **not recorded**, rather than inferred from the current viewer.
7. Repeat the visual checks in Light, Dark and System themes and a narrow window. Confirm the account, Run button and status text remain readable.

## Limits and location

The website and portable builds are local; this change has not been pushed to GitHub or publicly deployed. Neither requires Docker. Native Windows execution and live-tenant acceptance remain pending. Mac signing remains ad-hoc, without Developer ID signing or notarization. Desktop resume, team upload and migration of executable first-hour response controls remain outstanding.

Repeat checks/builds from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
node --test tests/desktop.test.cjs
npm run desktop:package:mac
npm run desktop:package:win
node test-results/beta19-verify-packages.mjs
```

## Package verification

- Rebuilt the macOS ARM64 and Windows x64 portable downloads at **0.19.0**, with Beta 19 and shared build 31.
- Both ZIPs passed CRC checks. Archived native host/preload, shared UI, collection scripts, version files and guides match current source. SHA-256 sums were refreshed.
- Strict Mac signature checks passed before and after ZIP extraction. The extracted app launched and reported bundled-runtime readiness. The recurring sandbox-extension diagnostic did not prevent launch/readiness. Signing remains ad-hoc.
- The local server was checked to serve Beta 19 and the new execution labels without refreshing the user's active case. No Docker was started and nothing was pushed to GitHub.
- Native Windows execution and real-tenant acceptance remain pending.

SHA-256:

```text
309de11a471888fa9b023a4865b127022f14ab35441c834ec44debf6c8c134de  Triage-macOS-arm64.zip
ca2f5140addeab1db895e71a032f9607b0e7e67e18f72d55a1cb08b5933f586d  Triage-Windows-x64.zip

```

Evidence: `test-results/beta19-package-mac.log`, `beta19-package-win.log`, `beta19-archives.log`.

[Browser preview](../../test-results/beta19-web-execution.png) · [Portable preview](../../test-results/beta19-native-running.png) · [Validation history and checklist](../../BETA/docs/VALIDATION.md)
