# Beta 17 — visible finding review validation

Date: 2026-09-15. Shared build 29; desktop 0.17.0. Local development candidate.

## Changes

The screenshot was reproduced as an empty confirmed review: Save rejected the missing evidence reference, but its notification was outside the modal dialog and appeared behind the backdrop. The existing browser test checked notification text without checking its position inside the dialog.

- Missing reasons and invalid confirmation references now appear beside their fields inside the shared review dialog. A summary states that the review was not saved, the first invalid field receives focus, and the draft remains intact.
- Validation clears as the fields or decision are corrected. Reopening a saved review restores the saved values without old errors. Every decision still requires a reason; confirmation still requires an existing evidence record.
- Unexpected errors raised while a dialog is open appear within that dialog. The generic sign-in example was replaced with a source-neutral evidence-reference placeholder. References remain manually selected; they are not automatically linked or semantically verified against the finding.

## Verification

- **116 browser checks passed**, including empty/invalid references, required reasons, correction, changing decisions, preserved drafts, reopening, generic modal errors and exactly one action-log entry for a successful review after invalid attempts.
- **15 model/native-script regression tests passed**, including existing evidence-reference enforcement and case/action-log preservation.
- **28 native UI checks passed** with the actual host/preload in an isolated profile, bundled PowerShell and synthetic checkpoint evidence. Four review checks verify the same visible field errors, correction, successful save and single action-log entry in the portable viewer.
- An initial native test run stopped at the existing Overview navigation assertion before reaching review checks. A rerun with navigation diagnostics passed all 28 checks without changing application code. The initial failure was not reproduced; both logs are retained.
- Light, dark, narrow-screen and native dialog screenshots were visually reviewed. JavaScript syntax and Git whitespace checks passed. Tests did not contact a Microsoft tenant or modify the user's active case.
- The full analyzer/collection suite and broader native readiness smoke were not rerun for this UI-only change. Earlier results remain below. Final package/source/archive verification is recorded after packaging in `review/2026-09-15/BETA-17-REVIEW-VALIDATION.md`.

Evidence: `test-results/beta17-browser.log`, `beta17-unit.log`, `beta17-native-progress.log`, `beta17-native-progress-retry.log`, `beta17-review-before.png`, `beta17-review-errors.png`, `beta17-review-errors-dark.png`, `beta17-review-errors-mobile.png`, `beta17-native-review-errors.png`.

## Limits

Native Windows execution and live-tenant acceptance remain pending. Mac downloads use an ad-hoc development signature; Developer ID signing and notarization remain outstanding. Existing collection/resume/team-upload/first-hour-control limitations remain unchanged. No Docker is required. These changes are local and have not been pushed or publicly deployed.

Reproduce from PowerShell:

```powershell
Set-Location /Users/mihaimonte/REPO/triage
node --test tests/desktop.test.cjs
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
node tests/desktop-progress.mjs
npm run desktop:package:mac
npm run desktop:package:win
```


## Package verification

- macOS ARM64 and Windows x64 portable downloads rebuilt at **0.17.0** with Beta 17 / shared build 29.
- Both archives passed CRC checks. Their native host, shared viewer, evidence model, collector, build stamps and guides match current source.
- Strict Mac signature verification passed before and after ZIP extraction. The extracted app launched and reported bundled-runtime readiness. The same sandbox-extension diagnostic as the prior release appeared without preventing launch/readiness.
- Native Windows launch remains pending; the Windows package was cross-built on macOS. Mac signing remains ad-hoc, without Developer ID signing or notarization.
- The existing local website was verified to serve the new build and validation code. The user's open browser/case was not refreshed. No Docker was used and nothing was pushed to GitHub.

SHA-256:

```text
a7f13ce5f3de71387ee0d2f3f8c260c71acf67a0166c8bf571ea6782cc65b8fc  Triage-macOS-arm64.zip
a23393253fcae416aedb30e36a2b9ccfef2e1a8cd8d03d78d46e24f54282e56b  Triage-Windows-x64.zip
```

Package evidence: `test-results/beta17-package-mac.log`, `beta17-package-win.log`, `beta17-archives.log`.

## Quick acceptance check

1. Export your current case before refreshing the local website or replacing the portable app. Confirm the sidebar shows **BETA 17**.
2. Open a finding, choose **confirmed** and click **Save review** with empty fields. Both field errors should appear inside the dialog and the reason field should receive focus.
3. Enter a reason and a nonexistent reference. Saving should retain your draft and focus the reference field.
4. Enter a reference copied from a supporting Evidence record and save. The dialog should close; Action log should contain one new review. Reopen the finding to confirm the saved values.

[Validation history and commands](../../BETA/docs/VALIDATION.md) · [Updated dialog screenshot](../../test-results/beta17-review-errors.png)
