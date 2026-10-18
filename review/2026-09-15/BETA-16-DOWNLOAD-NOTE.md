# Beta 16 — macOS note beside the portable downloads

15 September 2026. Shared build 28; desktop 0.16.0. Local change; no public deployment.

## Delivered

The download page and collector guides show:

```powershell
xattr -dr com.apple.quarantine "/Applications/Triage.app"
open "/Applications/Triage.app"
```

The expandable alternative contains the requested command adapted to Triage:

```powershell
xattr -cr "/Applications/Triage.app"
```

The note explains that the first command removes only quarantine and the second clears all extended attributes. It asks users to use the actual extracted app path, limits the advice to trusted downloads blocked by quarantine, and distinguishes this from repairing damaged files or obtaining Apple notarization. Apple's Open Anyway path is linked.

## Validation

- Read the installed xattr command's help and the MarkText release guidance; checked Apple's first-launch guidance.
- Browser inspection verified placement, exact command strings, expanded alternative, no horizontal mobile overflow and no runtime errors. Light/dark/mobile screenshots were visually checked.
- Syntax and whitespace checks passed. No quarantine command was executed and no security settings were changed.
- Collection behavior was not changed; the broader collection test suite was not rerun for this text/layout-only change.

## Packages

- macOS ARM64 and Windows x64 downloads rebuilt at 0.16.0.
- Both archives passed CRC checks; their native code, shared viewer, collection scripts, build stamps and guides match current source.
- Mac strict signature verification passed before and after extraction. The extracted app launched and reported runtime readiness. A sandbox-extension diagnostic appeared, but launch/readiness succeeded without changing security settings.
- Windows is cross-built; native Windows launch remains pending. Mac signing is ad-hoc, without Developer ID/notarization.

SHA-256:

```text
478936d875f9493f11457cfa83707cc7e0125f175e8dafeeff3c3d303f5e4abc  Triage-macOS-arm64.zip
082382b6f44bbe00932906ef522dc77069c1269d66c27815da7b47a0ea18658d  Triage-Windows-x64.zip
```

Evidence: `test-results/beta16-download-note.log`, `beta16-download-note.png`, `beta16-download-note-dark.png`, `beta16-download-note-mobile.png`, `beta16-package-mac.log`, `beta16-package-win.log`, `beta16-archives.log`.

[Collector guide](../../BETA/docs/COLLECTOR.md) · [Validation history and rebuild commands](../../BETA/docs/VALIDATION.md)
