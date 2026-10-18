> **Retired with beta 31.** This guide describes screens that no longer exist (the quick web check, the collection form, the separate runbook page). The current flow is documented in [the user guide](../USER-GUIDE.md). Kept for reference only.

# Quick user check and containment — end-user walkthrough

Use this workflow when somebody reports a suspicious sign-in, unexpected MFA prompt or possibly compromised account. The website brings together the existing single-user checks and the detailed first-60-minutes response runbook. Docker is not required for the browser-based checks or Microsoft Graph containment actions.

Beta 6 adds case handoff, device saving, an explicit action journal and verification states. See [the Phase 1/2 walkthrough](PHASE-1-2-GUIDE.md) for the complete updated flow.

## 1. Open the site and sign in

Open the Triage beta address provided to you. The local preview is [the quick-user site](http://localhost:8080/BETA/).

Choose **Sign in with Microsoft** using your authorized investigation account. Your administrator must have arranged the necessary tenant consent and reader access. Choose **Try the demo** to practise with simulated records and actions.

The separate **Full tenant triage** option opens a broader investigation workspace. You do not need it for the quick-user workflow.

## 2. Select the suspected user

Choose **Quick user check**. Type the user's name or email address, select the matching account and check the email address carefully. Choose the lookback period and whether to include the **Unified Audit Log**, then select **Start triage**.

Keep the tab open while collection runs. The progress view lists each source. Review any failed or skipped sources; unavailable evidence must not be interpreted as a clean result.

## 3. Review and preserve the findings

The report shows the selected account and findings ranked by severity. Use the severity/category filters or search to focus the list. Review supporting details and compare suspicious activity with what the user and IT team expect.

A finding is an indicator to investigate, not automatic proof of compromise. Save **Evidence JSON** before making changes. **Findings CSV** provides a summary, and **Print / PDF** provides a readable report.

## 4. Open the detailed containment runbook

Choose **Contain this account** from the report. The same account and its findings are carried into the runbook. Check the account displayed above the runbook and in the sidebar.

The runbook retains the existing content:

1. Preserve investigation evidence.
2. Revoke sign-in sessions.
3. Disable account access when appropriate.
4. Reset the password when appropriate.
5. Review and remove attacker-added authentication methods.
6. Review mailbox rules, forwarding and delegation.
7. Review suspicious OAuth grants.
8. Continue through the fifteen blast-radius checks, evidence checklist and communication templates.

Use the runbook navigation in the desktop sidebar to jump between sections. On a phone, scroll through the same sections in order. Read each step's explanation and record deliberate skips or completed reviews accurately.

## 5. Arm only when you are ready to respond

Initially, actions that change the account are disabled. **Arm containment** requests the additional write permissions. Your account must have the required Microsoft permissions and role; the interface does not grant those rights by itself.

Each action still opens a confirmation naming the selected user. Review it and choose **Cancel** if the target or action is wrong. Arming alone does not execute the response steps.

In the demo, these actions are simulated. In a live tenant, confirmed actions can take effect immediately.

## 6. Understand the Exchange step

Browser-based Graph containment is available with the required Microsoft permissions. Automated changes to mailbox rules, forwarding and delegates need the separately configured **Exchange containment backend**. When that backend is absent, the runbook retains its copy-ready PowerShell instructions for an authorized Exchange administrator.

The full-tenant workspace's newer **Exchange collector** is read-only. It collects mailbox snapshots and does not grant mailbox-remediation powers. Installing that collector does not turn on the quick-user runbook's Exchange change buttons.

## 7. Assess impact, communicate and hand over

Work through the blast-radius checks and review their coverage and errors. Preserve the evidence needed for the incident. Use the communication templates and involve the appropriate incident owner, privacy/legal contacts and leadership where required.

Download the **Handover report** and **Action log CSV**. The action log records the runbook actions and checked items; a checked item is your record, not independent proof that the wider incident is resolved.

Save your reports and evidence to the approved incident location before signing out, refreshing or closing the tab. The quick-user session is not automatically saved as a shared case. Exiting the beta quick-user page clears its in-memory target and runbook state.

## Practice first

Choose **Try the demo** → **Quick user check** → search for **Jan** → **Start triage** → **Contain this account**. Review the runbook, arm the simulated containment, cancel one confirmation, then confirm a demo action. Download the handover report and check that it names the same account.
