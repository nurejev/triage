# Beta 25 — collection controls and merged first-hour workspace

Local candidate: Beta 25 / desktop 0.25.0, 2026-09-16. No deployment or tenant changes.

1. The sidebar shows connection/collection/cancellation status, execution method and completed-source progress. Selecting it returns to the live overview. It disappears when acquisition ends.
2. Select all / Deselect all operates on the current form's available sources. The browser cannot select app-only sources; the native plan retains all 34 selectable sources. An empty plan still fails existing validation.
3. First 60 minutes now contains phase guidance, the outcome form and connected response/checks. Response retains account selection, separate connection, arming, evidence preservation and action logging. Navigating back to the page retains the connected response workspace.

Also fixed the supporting-source shortcut's reference to an undefined button variable.

Validation: 140 browser UI checks and 52 native UI checks passed with synthetic data. Native checks include bulk selection and sidebar progress. Browser checks assert that phase outcomes and account response share one selected navigation page. No Microsoft response action was executed. Prior live-tenant, Windows and suite-equivalence limitations remain in the coverage contract.

Logs: test-results/beta25-browser.log and beta25-native.log. Portable ZIP hashes: BETA/downloads/SHA256SUMS.txt. Package identity checked with `node tools/verify-packages.mjs`.

Repeat locally in PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
npm run desktop:package:mac
npm run desktop:package:win
node tools/verify-packages.mjs
```

Both final ZIPs contain matching Beta 25 UI sources. Mac extraction, ad-hoc signature, launch and bundled-runtime readiness passed. Windows is cross-packaged; native Windows execution remains pending.

```text
900bc2f129d941b772cae8887c146519a2d3d1ba709b97064aa37fb1ac307c83  Triage-macOS-arm64.zip
0aa151f8b781a99f8cc812a2e04740b2383468b6c653558716f66aff9955a1f1  Triage-Windows-x64.zip
```
