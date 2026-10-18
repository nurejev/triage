# Beta 14 — portable/web consistency acceptance

Use this addendum alongside [the broader testing checklist](BETA-13-TEST-CHECKLIST.md). All items below await your manual acceptance; automated fixture results are recorded separately in [the validation report](BETA-14-CONSISTENCY.md).

## Start here

1. Save/export any open case. Refresh the [local website](http://localhost:8080/BETA/) and confirm **BETA 14**. If the website is stopped, run:

   ```powershell
   Set-Location /Users/mihaimonte/REPO/triage
   npm run web
   ```

2. Download the updated [macOS Apple silicon ZIP](http://localhost:8080/BETA/downloads/Triage-macOS-arm64.zip) or [Windows x64 ZIP](http://localhost:8080/BETA/downloads/Triage-Windows-x64.zip). Extract into a new folder, open Triage and confirm **BETA 14**. Keep the complete extracted app/folder together.

3. Use an authorized test tenant and account for live acquisition. The website collects Graph; the portable app also offers mailbox sources. For a direct comparison, select the same Graph sources, account and collection window.

## Checks

| ID | Done | Action | Expected result |
|---|---|---|---|
| C01 | [ ] | Open Quick check in each client. | Same heading, scope/window layout, source list and adjacent Account to check / Run controls. Native additionally asks for tenant ID. |
| C02 | [ ] | Start a check in each client and complete Microsoft sign-in. | Overview opens immediately; selected-source progress, waiting/collecting/complete/failed states and record counts have the same layout. |
| C03 | [ ] | Open a collecting/completed source before the run ends. | Records already returned are clickable. Waiting sources do not imply a zero-record result. Failed sources expose the original error. |
| C04 | [ ] | Expand Collection details under Overview, then wait for an update. | Native output is readable but not the main progress screen. The details remain expanded. Web shows source activity in the same location. |
| C05 | [ ] | Record an action-log note during collection; type an unsaved runbook draft and wait until collection ends. | The note remains in the final/exported case. The runbook stays open and retains the draft. |
| C06 | [ ] | Cancel a separate collection after records arrive. | Returned records remain available; unfinished sources show cancelled/incomplete, not complete. New-case/export controls become available again. |
| C07 | [ ] | Export one completed case and open that exact file in both clients. | Same Overview totals, source statuses/counts, findings, raw records, runbook outcomes and action-log entries. Separate live runs may legitimately differ. |
| C08 | [ ] | Choose System theme, change OS appearance, then try a narrow window. | Both clients switch appearance automatically and retain readable layouts and clickable controls. |

## Where this runs

This candidate is local development work. The website uses a local static Node server; the portable app has its own local viewer and bundled PowerShell. Neither needs Docker. GitHub/public deployment is separate and was not changed by this UI update. Sharing a case here means exporting/importing a file; automatic team upload is not configured.

Windows launch/live-tenant success and macOS browser-download acceptance still need manual verification. The Mac app is ad-hoc signed for development, not Developer ID signed or notarized; first-hour response buttons and desktop resume are still outstanding.
