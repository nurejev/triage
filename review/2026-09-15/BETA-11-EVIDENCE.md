# Beta 11 — evidence navigation and delegated grants

15 September 2026. Shared build 23; desktop 0.11.0. Local only; no public deployment or live tenant changes.

## Corrected behavior

1. Evidence source names, counts, status badges and the complete row now open the records directly below that source. Opening a source brings its records into view. The row supports keyboard expansion/collapse and narrow screens. Original records remain individually inspectable. Errors, collection queries, and empty/uncollected states are explained in the expanded panel.
2. The observed OAuth “Only Equals comparison” failure was traced to a cross-property OR filter in both collectors. It is replaced by separate equality queries for the affected user's grants and tenant-wide consent. Combined records and the current query/page are preserved when collection stops. Web resume retains earlier grants, continues the unfinished query, and replaces the old rejected query when resuming a legacy failed source.
3. Portable builds now use separate temporary roots. The first parallel packaging attempt revealed that Electron Packager clears its shared temporary folder; independent roots prevent one platform build from deleting the other's files.

## Passed checks

- 38 analyzer/import assertions; 52 unit/script tests; 72 browser checks.
- Actual native PowerShell collection with fixture responses: user and tenant grants combined; user grants retained when the tenant query fails.
- Native macOS launch/runtime checks, shared analysis, private browser handoff, save and action-log restoration after restart.
- Both packaged apps' native code, viewer, collector script and guides match current source.
- Mac app strict signature verification before and after ZIP extraction; extracted app launch and runtime readiness.
- Windows package cross-build. Both ZIPs are checked for CRC integrity and their SHA-256 manifest is refreshed.
- Desktop/mobile screenshots visually inspected; source syntax and Git whitespace checks passed.

Logs: `test-results/beta11-tests.log`, `beta11-browser.log`, `beta11-native-smoke.log`, `beta11-package-mac.log`, `beta11-package-win.log`, `beta11-archives.log`. Screenshot: `test-results/beta11-evidence-detail.png`. Archive hashes: `BETA/downloads/SHA256SUMS.txt`.

## Remaining work

Live Graph/Exchange tenant acceptance and native Windows execution were not performed. Mac signatures are ad-hoc development signatures, not Developer ID signing or Apple notarization. Desktop resume and team upload remain unimplemented. Historical certificate-container tests were not repeated. No Docker runtime was started for this update.

The executable first-hour response controls from the original tool are still absent from the redesigned runbook. This update does not claim to restore them.

[Validation record and exact PowerShell reproduction commands](../../BETA/docs/VALIDATION.md).
