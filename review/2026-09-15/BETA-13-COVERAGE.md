# Beta 13 — clear collection coverage

15 September 2026. Shared build 25; desktop 0.13.0. Local changes; no public deployment or live tenant activity.

## Result

1. Coverage now shows selected-source progress and separate counts for complete, collecting, waiting, failed and partial results.
2. Status icons, labels and colors separate active collection, missing evidence and successful queries. A zero count is shown for an empty completed query, not for an unstarted source. Active and incomplete sources appear first in the overview.
3. Original evidence and collection errors remain clickable. Saved running requests are presented as interrupted, while their stored state is preserved. Mobile, dark theme and reduced-motion support are included.

## Validation

- 99 browser checks passed, including the screenshot's 83-record scenario using a paused synthetic request, queue and selected-scope progress, failed/partial/empty completion, interrupted imports, evidence navigation, mobile and theme behavior.
- 38 analyzer/import assertions and 52 existing unit/script checks passed after the behavioral changes. Final neutral waiting colors were then checked in the browser.
- Native macOS runtime, command/concurrency/cancel guards, shared analysis, private browser handoff, saved case/action-log restoration and theme persistence passed.
- Light, dark, mobile and finished-state screenshots visually inspected. Source syntax and whitespace checks passed.

## Portable packages

- macOS ARM64 and Windows x64 downloads rebuilt at version 0.13.0.
- Packaged native code, shared coverage viewer, build stamps and guides match current source.
- Mac strict signature verification passed before and after ZIP extraction. The extracted application launched and reported runtime readiness. A sandbox-extension diagnostic appeared, but readiness passed without changing security settings.
- Both ZIP archives passed CRC integrity checks; their embedded coverage code, stylesheet and index match source. SHA-256 download hashes were refreshed.
- Windows was cross-built; native Windows execution remains outstanding.

## Limits

Native acquisition retains its existing collector progress screen; this panel appears in the shared case viewer. No live Graph or Exchange tenant validation or native Windows execution was performed. Mac signatures are ad-hoc development signatures; Developer ID signing and notarization are outstanding. No Docker runtime was started.

Desktop resume, team upload and migration of the original first-hour executable response controls remain outstanding.

[Full validation record and PowerShell reproduction commands](../../BETA/docs/VALIDATION.md).

Logs: `test-results/beta13-browser.log`, `beta13-tests.log`, `beta13-native-smoke.log`, `beta13-package-mac.log`, `beta13-package-win.log`, `beta13-archives.log`.
