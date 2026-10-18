# Beta 29 — dedicated evidence folder

## Behavior

- Default macOS location: `~/Library/Application Support/Triage/`.
- **Choose evidence folder…** on the collection screen opens the native folder picker; **Evidence folder…** in an open case also saves the current complete bundle to the chosen location.
- **Open folder** reveals the destination in Finder / File Explorer.
- New acquisitions write raw checkpoints, collection plan, connection metadata and final `case.json` into `cases/<case-id>/<attempt-id>/` under the destination. Stopped collections retain partial evidence.
- **Save to evidence folder** writes current evidence, reviews, notes and action log to `saved-cases/<case-id>.json`. A private case-library copy remains in the application data folder so older cases remain accessible after switching destination.
- Earlier acquisition directories are not moved. Opening an older case and choosing a folder saves its complete evidence bundle there; it does not copy the old acquisition directory.
- Destination survives app restarts via preferences, and changing theme preserves it. Cancelled folder selection leaves it unchanged. Folder changes are blocked during collection; a missing or unwritable destination raises an error rather than silently choosing another location.
- Profiles and credentials remain private. The transient Azure certificate is created in the OS temporary directory, never in the evidence destination.

## Validation

- 78 unit / collector / security tests passed; engine regression checks passed.
- 63 isolated native UI checks passed, including folder selection, theme preference retention, picker cancellation, raw collection destination, reviewed bundle destination and existing stop-scanning behavior. Synthetic data only.
- 148 browser UI checks passed.
- Initial sandboxed test attempt could not bind loopback; rerun with local test permissions passed.
- Initial native assertion expected the old save notification; updated to the new destination message and rerun passed.
- Live Microsoft authentication and real tenant collection were not executed. Windows runtime acceptance remains manual.

## Repeat checks and rebuild (PowerShell)

```powershell
Set-Location /Users/mihaimonte/REPO/triage
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm test
npm run test:browser
node tests/desktop-progress.mjs
npm run desktop:package:mac
npm run desktop:package:win
node tools/verify-packages.mjs
```

## Manual acceptance

1. Extract the new portable app and choose a dedicated evidence folder before scanning.
2. Run a small collection. Use Open folder and inspect the case directory and final case.json.
3. Add a review or note, choose Save to evidence folder, then reopen the saved bundle and confirm the note exists.
4. Restart the app and confirm the same destination. Switch light/dark/system theme and confirm it remains selected.
5. Stop a scan and confirm partial evidence remains available.
6. Disconnect an external destination and confirm collection fails visibly; reconnect it or choose another folder.

No push or deployment performed. Docker is not needed.

## Packages

Mac and Windows downloads rebuilt as 0.29.0 / Beta 29. Packaged source/runtime identity checks passed for both. Mac ZIP extraction, ad-hoc signature verification and bundled runtime startup smoke passed. Windows execution was not tested. SHA256SUMS.txt refreshed.
