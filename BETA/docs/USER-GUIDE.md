# Triage user guide — one investigation in seven steps

This guide is for the person investigating activity in Microsoft 365, on the website or in the desktop app. Access is arranged by your administrator; you do not configure an app registration or run PowerShell yourself. Administrator setup lives in [the collector guide](COLLECTOR.md) and [the customer connection guide](CUSTOMER-CONNECTIONS.md).

Triage collects evidence, analyzes it and keeps every decision with the case. Findings help you decide what to look at; they are not confirmation of an incident. Nothing changes in the tenant until you arm containment on the Respond step, and Triage says so before it asks for that permission.

## The rail

The sidebar groups the seven steps into **Prepare**, **Investigate**, and **Act & transfer**: **Start → Connect → Scope → Collect → Review → Respond → Hand over**. The current step is highlighted. Locked steps explain what is needed to open them. On a small screen, **All steps** expands the complete workflow; Escape closes it.

A tick represents recorded work. Collect gets a tick only when every selected source completed; a finished collection with gaps gets an amber exception. Review requires resolved decisions for every current finding; **investigating** stays outstanding. Respond requires an analyst review or documented exception for all five phases; exceptions remain amber. Hand over requires an explicit handover record. Visiting a page or downloading a file never completes these steps. An empty findings list does not establish that the investigation is finished.

Two things hold everywhere: the browser's **Back** button returns to the previous screen (it also closes an open finding or record), and reloading the page reopens the same case on the same screen. The case header names the tenant, affected account or whole-tenant scope, window, save state and whether response is armed. **Session & collection details** expands idle technical details; running collection and analysis stay visible.

## 1. Start

Choose one of three things. **New investigation** takes you to Connect (or straight to Scope when you are already signed in). **Open a case** lists the cases saved on this device or computer and lets you choose a case file (`.json`) or a supported raw export. **Explore sample case** opens a fictional Contoso tenant so you can walk all seven steps without touching a real tenant.

In the desktop app, Start also offers **Continue last case** and explains how to open a plan saved on the website (*Triage → Open collection plan…* in the app menu).

## 2. Connect

Connect the services needed by this case. Separate services, expired sessions and response permissions can require additional prompts; the workspace explains them before connecting.

**On the website** choose the tenant first. *My organisation* signs in to the account's own tenant. *Customer tenant · by domain* asks for the customer's domain (for example `contoso.com`), looks up its tenant ID and pins the sign-in to that tenant, so a partner account gets access to the customer rather than to its home tenant. Then press **Sign in with Microsoft**. A Microsoft window opens; Microsoft may ask for MFA or consent. When the row shows **Ready** with your account and the tenant, press **Next: choose the scope**.

**In the desktop app** the step first checks the bundled PowerShell runtime; the sign-in buttons wait for that check. Choose *Delegated user* or a saved *customer connection* (application + certificate; see the customer connection guide), enter the tenant's domain or ID and press **Look up tenant**. Each service is a row: **Microsoft Graph** is required; **Exchange Online** is optional and supplies mailbox and audit evidence. Optional Azure sources must be enabled during connection setup. Press **Sign in** on a row, watch it wait, see the result. The browser opens for that row only. Tick *Include email content and attachments* before signing in to Graph if the case needs message content; it asks for the extra mail permission. A signed-in service stays signed in until you collect or until thirty minutes pass without collecting; the row then asks you to sign in again.

The top-right button is **Disconnect**; it signs out but keeps the open case.

## 3. Scope

Choose who, how far back and how much. **Investigation scope** is one affected account or the whole tenant. **Lookback window** is 1 to 180 days, counted back from now in UTC. For one account, type the address; on the website the tenant suggests matching accounts as you type and confirms the one you pick. The desktop app verifies the account against the tenant when collection starts.

**Evidence to collect** offers presets. *Quick* is the Microsoft Graph core: sign-ins, directory changes, risk, users and OAuth grants. *Standard* adds the Unified Audit Log, roles, devices, MFA registration, application identities and — in the desktop app — the mailbox snapshot. *Everything* (desktop app) is all 34 sources and can take longer than an hour. *Custom* lets you tick sources yourself. Presets that need Exchange Online are greyed out until that service is signed in on Connect; the mailbox snapshot needs one affected account.

Account investigations can include tenant-wide context such as application inventory and tenant-wide consent. Source rows distinguish account events, shared tenant context and current-state snapshots. A snapshot does not establish the state throughout the requested window.

Press **Start collection**. On the website you can also **Save collection plan**; the desktop app opens that plan through its menu and fills Scope from it, which is how a web investigation continues in the app for mailbox evidence.

## 4. Collect

Collection runs on this screen. A banner at the top states the collection target and what the selected sources cover: the affected account **in** its tenant, or **Whole tenant · domain**, with the window, the number of sources, the collection method and the analyst who is signed in. Check it before you wait — the wrong account or tenant is cheapest to catch here. The banner stays on the screen after the collection ends and on reopened cases. Each selected source shows its status, record count and any error; open a source to inspect the records that have already arrived. The rail shows the progress and a **Stop collecting** button; stopping keeps the records already returned and marks unfinished sources cancelled. The other steps are locked while collection runs. When it ends, analysis runs and **Review** opens by itself.

| Status | Meaning | Your next step |
|---|---|---|
| Collecting | The source is being collected | Keep the window open |
| Waiting | The source has not started yet | Nothing; it starts when its turn comes |
| Complete | The source returned the available records | Review the evidence; this does not mean the tenant is safe |
| Partial | Some evidence was collected, but the source is unfinished | On the website, **Resume incomplete sources** on Review; in the app, collect again |
| Unavailable | Microsoft denied access to this source | Ask your administrator to check permissions, roles and licensing |
| Failed | Collection did not finish | Read the error on Evidence, correct the cause, collect again |
| Cancelled | You stopped the collection | Use the retained records or collect again |
| Not collected | The source was not requested or never started | Do not read it as zero events |
| Not selected | Outside this collection plan | Add it to a later collection if needed |
| Interrupted | The case was saved while collecting | No collection is active; collect a fresh case if needed |

A longer window cannot recover records Microsoft no longer retains. A completed source with zero rows and a missing source mean different things.

## 5. Review

Review has four pages in the rail: **Overview** (priority signals, coverage, the latest activity), **Findings**, **Timeline** and **Evidence**. Evidence gaps stay visible across all four pages and Respond. **Inspect gaps** opens the coverage detail. Older imports without a source plan explicitly say that the original selection is unknown.

A finding opens in a **drawer beside the list**, not on another page. The drawer shows the signal and its actual supporting records **before** the review form. Open a record to inspect its original JSON. The first supporting reference attaches automatically; **Attach reference** selects another record. Aggregate findings paginate through every supporting record. If the link is missing, inspect the source and attach an existing case reference before confirming.

Record a decision (*investigating*, *confirmed*, *benign*) and a reason. **Confirmed** means the cited evidence supports the finding; it does not automatically confirm account compromise. **Investigating** remains outstanding. **Review response plan →** takes the finding's account to Respond. Close the drawer with its button, with Escape, or with Back.

On **Evidence**, click a source to expand its records under it; click a record to read its facts and original JSON in the drawer. A failed source shows its error and query. **Timeline** orders dated records; each row opens its record.

## 6. Respond

The first 60 minutes, in five phases: **Confirm & preserve**, **Contain & record**, **Establish impact**, **Preserve & export evidence**, **Communicate & hand over**. The phase track at the top shows the recorded decision per phase; **＋ Note or decision** records an outcome with a reference, and the case action log sits on the right.

Response always targets one account. A tenant-wide case asks you to choose it. The **Response session** row connects the read-only account checks: on the website it silently reuses the Connect sign-in; the desktop app opens one Microsoft window for it and says so on the row. Only then does the runbook appear under the rows: the arming card, the containment steps, the impact checks, the evidence checklist and the communication templates. **Arm containment** asks Microsoft for write permissions once per tenant and tells you first; every action still confirms before it runs. Mailbox rules, forwarding and delegates come from the desktop app's Exchange session (*Run local mailbox check*); mailbox changes remain reviewed manual PowerShell steps that you record here.

## 7. Hand over

The checklist says what the next owner gets and what is still open: unreviewed findings (with a shortcut to review them), phases without a decision, incomplete sources, and whether containment is still armed. **Exports** offers the case file (JSON, integrity-checked), the handover note (Markdown for the ticket) and the action log (CSV). **Exporting does not record a handover.** After handing over outside Triage, enter the next owner or team, the channel or ticket reference, and what was handed over with the next action. Press **Record handover**. The case records the time and outstanding findings, evidence gaps and response phases. This sends no message and does not verify recipient acceptance. The action log follows, with a field to add a note. **Start next investigation** saves the case and returns to Start.

## Saving

The case saves itself while you work: in the desktop app to the evidence folder, on the website to this browser's storage. The case bar shows *saving…* and then *saved 14:05*. **Save** and **Export case** remain for an explicit copy; the export is the file to hand to someone else or to open in the other viewer. Help has a switch to turn automatic saving off for a window, and a button to remove every saved case from this device.

## A five-minute practice run

1. On Start, choose **Explore sample case**; Review opens with the findings.
2. Open a finding, choose a decision, write a reason with a reference, save. Press Back: the drawer closes.
3. Open **Respond**, choose the affected account and connect the account checks; walk the phases and record one decision.
4. Open **Hand over**, download the note, then practise recording a fictional next owner, channel and next action.
5. Press **New case** in the case bar and start again.

You have now practised the whole flow without accessing a tenant.
