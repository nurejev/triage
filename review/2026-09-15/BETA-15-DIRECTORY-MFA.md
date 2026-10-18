# Beta 15 — directory-role and MFA query regressions

15 September 2026. Shared build 27; desktop 0.15.0. Local changes; no public deployment or live tenant calls.

## What failed and what changed

| Source | Rejected request | Corrected behavior |
|---|---|---|
| Directory role assignments | Expanded `principal,roleDefinition` together; Microsoft returned “Only one property can be expanded in a single query.” | Expand `roleDefinition` alone. Retain assignment/principal IDs and resolve readable identity from collected inventory or the canonical case subject in the shared evidence model. Original raw assignment records remain intact. |
| MFA registration, one account | Filtered the registration list with `id eq ...`; Microsoft returned “Query not allowed on property: id”. | GET the dedicated `userRegistrationDetails/{userId}` report and store its single object as one evidence record. Verify the returned account ID. |

Both web and PowerShell collection are fixed. Tenant-wide registration remains a paged list. Denied, missing or mismatched reports remain gaps, not evidence that MFA is absent. Readable role names are retained; identity fields can remain unavailable when their source inventory was not collected.

Web retry now replaces a legacy rejected query URL, preserves valid paging checkpoints and clears a previous error after a successful result. Earlier source-result entries remain in the action log. Portable resume remains unimplemented: rerun using the new app.

The existing site's quick MFA check reads authentication methods; the beta registration tile uses a different report. This change corrects the report query and does not add a methods inventory or change tenant consent.

## Evidence and validation

- 38 analyzer/import assertions and 63 unit/script tests passed. Ten new regression tests cover both query failures, user/tenant scopes, raw evidence, identity lookup, pagination/partial results, legacy-query resume, denial, missing reports, cancellation and wrong-user rejection.
- The actual PowerShell collector passed the new role and MFA fixtures, including zero/multiple tenant results and a single-user report.
- 105 browser checks passed, including five new checks through the actual quick-check UI, source query details and original role/MFA record inspection. Screenshots were visually reviewed.
- 24 isolated native collection UI checks passed. Native macOS runtime smoke checks also passed for real module readiness, collection guards, shared viewer, private browser handoff, case/action-log persistence and theme persistence.
- A final focused rerun passed all 22 directory/desktop tests after adding explicit clearing of old source errors. Syntax and whitespace checks passed.

Logs: `test-results/beta15-targeted.log`, `beta15-tests.log`, `beta15-browser.log`, `beta15-native-progress.log`, `beta15-native-smoke.log`. Synthetic screenshots: `beta15-directory-fixed.png`, `beta15-mfa-fixed.png`.

## Updated downloads

- macOS ARM64 and Windows x64 rebuilt at 0.15.0 and served successfully by the existing local website.
- Packaged host, shared collection/evidence code, PowerShell collector, version stamps and guides match source. Both ZIP archives passed CRC checks; archived collection scripts and native code match the verified builds.
- Mac strict signature verification passed before/after extraction. The extracted application launched and reported runtime readiness. A sandbox-extension diagnostic was emitted, but the launch check succeeded without changing security settings.
- Windows was cross-built; native Windows execution is still pending.

SHA-256:

```text
b9c996d7c20f4d9be3cd7084f0025f7527df16f9b0ecc94bc3ef0d2d472294ff  Triage-macOS-arm64.zip
e9b67e49c06512921f43e76fe3c3118b1eaf281eb0de216688b8aecc72b93d8b  Triage-Windows-x64.zip
```

Evidence: `test-results/beta15-package-mac.log`, `beta15-package-win.log`, `beta15-archives.log`.

## Test in your tenant

1. Export the currently open case, then refresh [the local beta](http://localhost:8080/BETA/) and confirm **BETA 15**. For portable collection, download the rebuilt [macOS ZIP](http://localhost:8080/BETA/downloads/Triage-macOS-arm64.zip) or [Windows ZIP](http://localhost:8080/BETA/downloads/Triage-Windows-x64.zip), extract it into a new folder and confirm the same version.
2. Start a new quick check for the affected account. Select **Directory role assignments** and **MFA registration**; include **User inventory** for account display/enabled-state context.
3. Open each source in Evidence. Roles should use a single `roleDefinition` expansion. MFA should show `/userRegistrationDetails/<user ID>` without an `id` filter. Inspect the returned records. If access/report availability still fails, preserve the new exact error rather than treating it as an empty successful result.
4. Optionally test tenant scope: MFA should use the paged registration list, and role assignments should remain scoped to the selected tenant. Compare an exported case in web and portable viewers for identical records and source states.

Saved case files retain their original acquisition results; the fix does not change historical failures into successful collections. If an eligible live web case is still open after updating, its incomplete sources can use **Resume incomplete web sources**.

Live-tenant success and Windows execution remain pending. Mac downloads are ad-hoc signed development builds, without Developer ID signing/notarization. No Docker runtime is required. Desktop resume, team upload and executable first-hour response-control migration remain outstanding.

Microsoft references: [role assignment list options](https://learn.microsoft.com/en-us/graph/api/rbacapplication-list-roleassignments?view=graph-rest-1.0), [role definition expansion](https://learn.microsoft.com/en-us/graph/api/unifiedroleassignment-get?view=graph-rest-1.0), [single-user registration GET](https://learn.microsoft.com/en-us/graph/api/userregistrationdetails-get?view=graph-rest-1.0).

[Full validation record and PowerShell reproduction commands](../../BETA/docs/VALIDATION.md).
