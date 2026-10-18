# Beta 8 replacement — implementation record

The beta entry page was replaced with a maintained static Limon-IT workspace. The current triage SVGs and existing green/lemon palette are retained. The old beta was backed up to the ignored `test-results/beta7-before-redesign.tar.gz`; pre-existing production/backend work was not reset.

## Implemented

- Quick Graph collection with user/tenant scope, selected sources, UTC window, progress, cancellation and same-session continuation.
- One case viewer for web and desktop: overview, findings, search/severity filter, evidence inspector, source coverage, timeline, analyst dispositions, first-hour runbook, chronological action log, case JSON/CSV/Markdown exports and explicit device saving.
- Fixed delegated native PowerShell collection in separate Graph and Exchange processes. Exact bundled module paths, tenant and mailbox identity checks, per-page/command checkpoints, partial/failure states, cancellation and no arbitrary-command IPC.
- Electron desktop shell with context isolation, sandboxed renderer, no renderer Node integration, restricted IPC, loopback allowlist and a private browser-viewer URL.
- Bundled runtime and build tooling for macOS arm64 and Windows x64; existing triage artwork used as platform icons. Source package locks and SHA-256 pins are retained.
- Retired beta generator to prevent a subsequent run from overwriting the maintained replacement page.
- Shared evidence normalization recognizes raw Graph role-assignment snapshots without changing originals; main cache/build advanced to 20, beta to 8.

## Validation

38 analyzer/import assertions; 50 unit/script-fixture tests; 40 browser checks. Native macOS launch and actual bundled-module imports pass. The actual packaged macOS app launches. Private browser handoff, source identity filtering, concurrent-collection rejection and cancellation-before-authentication are verified locally. Both ZIPs build; Windows execution is not tested on this Mac.

[Full validation and limits](../../BETA/docs/VALIDATION.md) distinguish live tenant acceptance, Windows/clean-machine checks, signing/notarization, and public promotion. Team upload is not implemented; case-file transfer and a private local viewer are implemented. The first-hour runbook records manual decisions and evidence; it does not execute containment. Saved collection plans carry scope and timing, not a prior case's evidence or review history.

## Review

Open `http://localhost:8080/BETA/`. The local beta compose service was rebuilt. Built ZIPs are mounted read-only under `/BETA/downloads/`. Build artifacts and generated case/test evidence are ignored by Git. No public deployment, commit or push was performed.
