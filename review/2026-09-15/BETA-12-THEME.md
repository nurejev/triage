# Beta 12 — System theme with automatic switching

15 September 2026. Shared build 24; desktop 0.12.0. Local only; no public deployment or live tenant changes.

## Result

1. The top-bar Theme selector offers System, Light and Dark on desktop and mobile. New users start with System; existing saved light/dark choices remain respected.
2. System follows live appearance changes without rebuilding the workspace, preserving unsaved runbook text, focus and selection. Manual choices remain fixed. Theme colors, logo and browser controls change together.
3. Browser preferences persist for the website. The native app stores only the validated theme choice in its preferences file, separately from case data, and restores it across viewer reloads and full app restarts with a new local server port. Native writes retain the existing trusted-frame validation.

## Passed checks

- 84 browser checks, including both automatic transitions, manual overrides, saved preferences, unsaved runbook drafts, mobile accessibility and existing case/evidence/quick-check behavior.
- 38 analyzer/import assertions and 52 unit/script checks after the functional changes. The version stamp was subsequently bumped for release.
- Native macOS System mode with actual Electron appearance events. The initial test was blocked by Playwright's default light override; removing that test override made both native transitions pass.
- Native preference validation and persistence across viewer reload and full app restart. Test cleanup restores the previous saved case and preferences.
- Native runtime readiness, command/concurrency/cancel guards, shared case analysis, private browser handoff and saved case/action-log restoration.
- Desktop light/dark and mobile visual checks; source syntax and Git whitespace checks.

## Portable packages

- macOS ARM64 and Windows x64 portable downloads rebuilt at version 0.12.0.
- Packaged native code, theme viewer, build stamps and guides match the current source on both platforms.
- Mac strict signature verification passed before and after extracting the ZIP. The extracted app launched and reported bundled runtime readiness. A sandbox-extension diagnostic was emitted during launch; the readiness check completed successfully without changing security settings.
- Both ZIPs passed CRC integrity checks and contain the exact updated theme script. `BETA/downloads/SHA256SUMS.txt` was refreshed.
- Windows was cross-built; native Windows execution remains untested.

## Limits

Windows native execution, live Graph/Exchange tenant acceptance, Developer ID signing and Apple notarization were not performed. Mac signing is ad-hoc for development. Historical certificate-container fixtures were excluded. No Docker runtime was started.

Desktop resume, team upload and the original executable first-hour response controls remain outstanding. The redesigned runbook still records manual outcomes.

[Validation record and exact PowerShell reproduction commands](../../BETA/docs/VALIDATION.md).

Logs: `test-results/beta12-browser.log`, `beta12-tests.log`, `beta12-native-smoke.log`, `beta12-package-mac.log`, `beta12-package-win.log`, `beta12-archives.log`.
