# Beta 30 — visible desktop readiness and mailbox diagnostics

Date: 2026-09-16. Desktop version: 0.30.0.

## Changes

- Both desktop readiness entry points open a dialog immediately with a spinner and an accessible progress message. Completion updates that dialog. Missing prerequisites and launch errors offer a retry.
- The check preserves the collection form, source choices, current case and current page. Closing the dialog does not cancel the local probe; reopening during the probe reuses it. A completed probe cannot reopen a dismissed dialog or replace another detail view.
- Removed the readiness panel formerly rendered below the full collection form.
- Graph error extraction now reads JSON after SDK request/response headers before truncating fallback text. Error codes, messages and available request IDs remain visible even after a long mail query.
- Mailbox 404 guidance distinguishes delegated user access from application access and identifies the connection and target tenant. Email and attachment sources continue to share unavailable-mailbox results and remain coverage gaps, not empty successful queries.

## Mailbox finding and remaining uncertainty

The supplied Exchange admin center screenshot shows an existing user mailbox. The collection screenshot shows Graph returning NotFound for the corresponding user messages endpoint. Those screenshots do not establish why that connection cannot read the mailbox.

Microsoft documents both object ID and UPN addressing for [listing messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0). The collector's object-ID route is supported. For another user's mailbox, delegated access requires the operator's existing mailbox/folder access and appropriate delegated mail permission; application access requires the appropriate application permission and mailbox scope. See [shared and delegated mail access](https://learn.microsoft.com/en-us/graph/outlook-share-messages-folders). Exchange admin center visibility alone is not evidence of permission to read messages through Graph.

No mailbox permissions, tenant settings or registrations were changed. No live Microsoft sign-in or tenant collection was performed. The live 404 remains unresolved pending a retry with the improved diagnostics and verification of the selected connection's access.

## Validation

- Passed: engine regression checks and 79 unit/collector/security tests.
- Passed: 158 browser checks, including 10 readiness checks covering visible progress, success, missing prerequisites, rejected requests, retry, dismissal, reopening, preserved inputs, an open case and a narrow window.
- Passed: 63 isolated native UI checks with synthetic data; no renderer exceptions.
- Visually inspected: readiness progress and success screenshots under `test-results/beta30-readiness-*.png`.
- Passed: Mac and Windows package JavaScript, PowerShell and readiness stylesheet identity checks.
- Passed: Mac ZIP extraction, local signature verification, app startup and bundled runtime readiness.
- Not tested: native Windows execution and live tenant Graph/Exchange/Azure acceptance.
- Initial sandboxed server checks could not bind a loopback port; reruns with local test permissions passed. The first browser run found an incorrect test selector for the active navigation item; correcting the selector and rerunning both focused and full browser suites passed. No application change was needed for that test failure.

Logs: `test-results/triage-beta30-*.log`.

## Packages

- `BETA/downloads/Triage-macOS-arm64.zip` — SHA256 `f98ba3310155a49c5761dbb44fdc7771baf23fb5a160625ad4dbeab690fe2d2a`
- `BETA/downloads/Triage-Windows-x64.zip` — SHA256 `2d700724514d1b3905b86dab56a7ea1212f59114af2a55b0474b6a34fdfd54e4`

`BETA/downloads/SHA256SUMS.txt` refreshed. The packages were rebuilt locally; no installed app was replaced, and no push or deployment was performed.

## Manual follow-up

1. Open the newly extracted Beta 30 app and select **Check desktop readiness**. Progress and the result should appear immediately in a centered dialog.
2. Retry email collection using the intended tenant and connection. If it still fails, inspect the preserved Graph error code, message and request ID, then verify mailbox access for that operator or application.
