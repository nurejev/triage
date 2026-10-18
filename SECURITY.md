# Triage security — Beta 6 / main build 18

The quick check and tenant browser collector use delegated Microsoft Graph access. The containment runbook requests write scopes only when the analyst arms it; individual changes require an account-specific confirmation. Microsoft enforces the signed-in analyst’s Graph permissions. Arming does not create authority the analyst lacks.

There are two separate optional Exchange services. The **tenant collector is read-only**. The **containment backend** can perform its fixed mailbox operations only when configured and authorized. Deploying the collector does not enable mailbox changes. Neither service accepts arbitrary commands or receives a Docker socket.

## Response authorization

The containment backend verifies the access-token signature, exact v2 issuer/tenant, audience, originating SPA, delegated API scope, expiry and assigned `Triage.Reader` or `Triage.Responder` application role. It refreshes signing keys for key rollover. Broad directory roles alone do not authorize this API. Preauthorizing a SPA is a consent convenience, not a substitute for checking its signed client identity.

The backend independently checks analyst and mailbox object-ID allowlists, protected IDs, enabled operations and case ownership. Mutations additionally require `ENABLE_MUTATIONS=true` and `Triage.Responder`. Empty allowlists deny access. The PowerShell helper resolves the approved immutable mailbox ID and checks its address before running a command. Exchange-side permissions must also be scoped and tested independently; an API allowlist is not proof of effective Exchange RBAC scope.

Existing backend registrations require migration: see [the migration guide](BETA/docs/PHASE-1-2-GUIDE.md). The provisioning script creates the new roles and v2 API tokens, with mutations disabled. It refuses to overwrite an existing credential/configuration. Do not rerun it to migrate an existing application.

## Evidence and local storage

Evidence normally lives in tab memory. **Save on this device** explicitly retains a case in IndexedDB in that browser profile. A separate checkbox enables a device-local action journal before Graph changes. Neither stores tokens, passwords or Graph request bodies. These records are sensitive and readable by anyone with access to the profile; they are not encrypted or tamper-proof. Sign-out clears the live session, not explicitly retained records. Export the journal and use **Delete device copies** to remove retained data.

Imported files and tenant-to-user handoffs provide evidence only. They do not restore armed state. A responder must sign in to the case tenant and re-resolve the immutable user identity before arming. The handoff uses a one-time nonce, exact origin and sending window, and expires after 30 seconds. Raw tenant evidence remains in the bundle; the quick-user view projects only the selected account. Exporting that case therefore retains the parent tenant records: use appropriate handling for the full bundle.

Source states distinguish complete, partial, unavailable, failed, cancelled and unverified imports. A completed source means the API returned its available records for that query, not that every historical event was retained. Missing UAL cannot produce a zero-activity answer. SHA-256 bundle integrity detects modification; it does not establish authenticity.

## Audit and outcomes

Graph changes require a successful local intent write before dispatch, followed by an accepted or failed/uncertain outcome. The backend similarly writes and flushes audit intent before execution and outcome after execution. Audit failures fail admission closed. When evidence is not marked preserved, live arming requires a recorded incident-authorized exception reason. This records the analyst’s decision and does not bypass authentication or permissions.

A failure after dispatch can leave the remote outcome uncertain; never blindly retry. Backend mutation operation IDs are reserved durably to reject repeat admission. Exports and device journals are not a centralized compliance archive; forward backend logs to customer-owned protected storage for that requirement.

Account enable/disable uses Graph state readback. Session revocation, password reset, authentication-method/grant changes and mailbox changes remain verification pending unless the relevant state has been explicitly verified. A successful session-revocation response cannot prove all previously issued access tokens have stopped working. Review refreshed inventories and tenant audit records.

## Packaging and operation

Web images copy allowlisted static assets. Certificates, evidence, audit logs, backend code and private runtime configuration are not served. The web image serves its baked-in version by default; moving-branch Git updates require explicit opt-in. Both Exchange services use pinned Node/PowerShell/Exchange module versions, unprivileged execution and bounded work/output. The containment API serializes/bounds its PowerShell queue and combines the quick runbook inventories in one read connection; the collector keeps its own durable jobs and ownership checks.

Private credentials belong in read-only mounts, never app JavaScript or an exported case. Restrict access to the host and its Docker daemon. The supported local collector profile is Linux amd64; Docker Desktop may emulate it on Apple Silicon.

## Validation boundary

Offline tests and local browser/Docker tests are documented in [VALIDATION.md](BETA/docs/VALIDATION.md). They do not establish effective tenant permissions, live Exchange compatibility, real containment outcomes or Azure readiness. Those are separate acceptance gates. This implementation has not been promoted to the public site.
