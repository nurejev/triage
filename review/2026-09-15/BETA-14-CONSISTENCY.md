# Beta 14 — portable and web screens use the same workspace

15 September 2026. Shared build 26; desktop 0.14.0. Local development work; no public deployment or live tenant activity.

## Result

1. Portable and web checks use the same setup layout and Account to check / Run controls. The native form retains the required tenant ID and its additional mailbox source.
2. Starting either check opens Overview at the top. Both use the same live source coverage, icons, statuses, selected-source progress, record counts and clickable evidence. Analysis is explicitly pending until collection ends.
3. Native source updates contain actual saved checkpoint records after tenant/source validation. Console output and synthetic counts cannot fabricate evidence. Detailed output is expandable below the dashboard.
4. Cancellation preserves returned records. Completion retains recorded analyst notes; ongoing updates and completion preserve the active runbook page and unsaved drafts. Source results are logged once per result.

## Validation

- 100 browser checks passed, including web acquisition, shared screens, evidence navigation, themes, mobile layout and starting Overview at the top.
- 24 isolated native UI checks passed using the actual Electron host/preload, bundled PowerShell and synthetic checkpoints. Matching source rows, counts and statuses were compared directly between the native app and its private web viewer. Live evidence inspection, cancellation, stale progress, wrong-tenant rejection, honest counts and note/draft retention passed.
- 38 analyzer/import assertions and 53 unit/script tests passed. Checkpoint validation and existing Graph/Exchange collection fixtures ran locally. A sandbox-only loopback restriction required rerunning the server tests with local-network permission; the full rerun passed.
- Native macOS smoke checks passed for real bundled module readiness, command/concurrency/cancel guards, sample analysis, private browser handoff, case/action-log saving and System/manual theme persistence.
- Light, dark, narrow-window and live-collection screenshots visually reviewed. Syntax and Git whitespace checks passed.

## Portable packages

- macOS ARM64 and Windows x64 downloads rebuilt at version 0.14.0.
- Packaged native host/preload/core, shared viewer, styles, version stamps, collector and guides match current source byte for byte.
- Mac strict signature verification passed before and after ZIP extraction. The extracted app launched and reported bundled runtime readiness. A sandbox-extension diagnostic appeared, but launch/readiness succeeded without changing security settings.
- Both archives passed CRC integrity checks. Their embedded viewer and native code match the verified builds; SHA-256 hashes were refreshed.
- Windows was cross-built; native Windows launch and collection acceptance remain pending.

SHA-256:

```text
04560b12ae91dbaa801c7576b3d87a409b3e33b6e122eff49c264a5a9bccf66e  Triage-macOS-arm64.zip
a3d7e226cf53db32348d03724177dd1b7db3bdd2b6624f4877a5604f622e460e  Triage-Windows-x64.zip
```

Evidence: `test-results/beta14-package-mac.log`, `beta14-package-win.log` and `beta14-archives.log`.

## Limits

No live Graph or Exchange tenant acceptance or native Windows execution was performed. Mac signing is ad-hoc for development; Developer ID signing and notarization remain outstanding. Desktop resume, team upload and migration of the original executable first-hour response controls remain outstanding. No Docker runtime is needed or was started for this change. No commit, push or public deployment was performed.

[Manual acceptance checklist](BETA-14-TEST-CHECKLIST.md) · [Full validation record and PowerShell reproduction commands](../../BETA/docs/VALIDATION.md)

Evidence: `test-results/beta14-browser.log`, `beta14-tests.log`, `beta14-native-progress.log`, `beta14-native-smoke.log`, `beta14-native-preview.png`, `beta14-native-running-dark.png`, `beta14-native-mobile.png`, `beta14-native-results.png`, `beta14-web-results.png`.
