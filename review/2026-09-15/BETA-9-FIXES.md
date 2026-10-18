# Beta 9 — launch and new-case corrections

Validated locally on 15 September 2026. Desktop version 0.9.0; shared build 21. No public deployment or Git push was performed.

## Result

1. **No Docker in the current workflow.** The owned beta web container is stopped. `npm run web` serves the beta at `http://localhost:8080/BETA/` using a loopback-only static Node server. The portable application includes its own local server. Legacy production/container files remain as historical references; default beta tests do not run them.
2. **Central next-case action.** When an existing case blocks a new collection, a prominent central panel offers **Save & start new case**, export, explicit discard and return. Saving retains the evidence and action log, then opens a fresh collection form. The native flow also retains access to the current case's browser viewer.
3. **Repaired Mac bundle signature.** The previous beta 8 bundle failed strict verification with “code has no resources but signature indicates they must be present.” The builder now signs the completed app, verifies it, extracts the finished ZIP, verifies that extracted copy and launches its runtime readiness check. Downloads are replaced only after these checks pass. Packaged contents are never patched after signing.

## Verified

| Check | Result |
| --- | --- |
| Analyzer/import assertions | 38 passed |
| Current unit/script tests | 47 passed, 0 failed or skipped |
| Browser checks | 47 passed; central action, evidence/action-log save, fresh form, explicit discard and mobile layout included |
| Native macOS smoke | Passed: launch, bundled modules, collection-plan/concurrency guards, cancel before authentication, case analysis, private browser viewer and save/restart |
| Mac package | Strict signatures passed before and after ZIP extraction; extracted app launch/runtime readiness passed |
| Normal Mac launch | Opened via Launch Services; native window visibly showed the collection form and Build 9 |
| Package source agreement | Both apps' native code, beta UI and guides match the current source |
| Archive integrity | All 3,824 Mac members and 1,500 Windows members passed ZIP CRC checks; SHA-256 manifest regenerated |
| Website | Local HTTP 200 with CSP; no beta Docker container running |
| Static checks | Changed source syntax and Git whitespace checks passed |

Evidence: `test-results/beta9-tests.log`, `beta9-browser.log`, `beta9-native-smoke.log`, `beta9-package-mac.log`, `beta9-package-win.log`, `beta9-gatekeeper.log` and `beta9-new-case.png`. Package hashes: `BETA/downloads/SHA256SUMS.txt`.

## Remaining limits

**Apple distribution approval remains incomplete.** The app has a valid ad-hoc development signature, but this Mac has no usable Developer ID certificate. The final `spctl --assess` result is **rejected**; a normal local launch does not prove that a browser-downloaded copy passes Gatekeeper. Developer ID signing and Apple notarization are still required for trusted public distribution. No quarantine or Gatekeeper protection was removed or disabled.

Windows was cross-built and archive-checked, not executed on Windows. Live Microsoft Graph/Exchange authentication and collection were not exercised. Five historical certificate-container fixtures were not repeated and are not counted in the passing tests. Team upload remains unimplemented.

## Run again

The website is already running for this session. To restart it later from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm run web
```

To open the repaired local Mac app:

```powershell
open '/Users/mihaimonte/REPO/triage/desktop/out/Triage-darwin-arm64/Triage.app'
```

To repeat the current checks and builds:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
npm test
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-smoke.mjs
npm run desktop:package:mac
npm run desktop:package:win
```
