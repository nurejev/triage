# BETA 33 workflow review

Reviewed 18 September 2026. Recommendation: **Option 2, a guided case workspace**. Keep the seven steps, but make evidence, outstanding work and the next decision more prominent than the procedure itself.

The input was `review/2026-09-17/workflow-redesign-beta33.html`. I inspected its rendered screens, its page generator and the relevant current application code. Statements in the supplied page were treated as claims to check, not instructions to execute. This is a local product and workflow review, not live Microsoft 365 validation. Existing application files and the supplied page were not changed.

## What is working

- The seven named steps give new analysts a useful map. Connect, Scope and Collect now have distinct jobs.
- The affected account, tenant and analyst are visible. The service connection rows make waiting and cancellation understandable.
- Collection distinguishes complete, partial, unavailable and uncollected evidence. Keeping returned records when stopping is valuable.
- The finding drawer, route restoration and saved-case model support continuity.
- The handover checklist preserves unfinished reviews, response phases and source gaps. Keep that behaviour.
- The green and lemon visual identity is coherent. A new colour scheme would not solve the main problems.

## Findings, in priority order

### F1 · High · Completion states overstate the work performed

The Respond and Handover examples show a tick beside Review while the status says “0 of 2 reviewed” or “0 of 37 reviewed”. The application marks Review done after a visit or any non-unreviewed disposition, and Respond done after a visit or any recorded phase. Exporting the Markdown note marks Handover done and labels it “Handed over”. These represent different milestones, but share a completion signal.

**Consequence:** an analyst or next owner can mistake navigation or export for completed work.

**Recommendation:** separate visited, in progress, decision recorded, complete and complete with exceptions. Collection can be “Ended with gaps”. Review should distinguish investigating from a resolved decision. Handover should move through prepared, exported and handover recorded; record the next owner and time. Do not imply recipient acceptance unless that is actually recorded. Allow urgent handover with explicit outstanding work.

Evidence: [step state](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:278), [handover label](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:579), [export handler](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:3161).

### F2 · High · The collection banner promises a narrower scope than the collector uses

The prominent account banner says “Only this account's records are collected”. However, account collection also requests tenant application inventory, and its OAuth requests include tenant-wide consent. The collector explicitly labels application inventory as tenant context. The account screenshot includes 148 application identities. The banner also mentions mailbox records even in the browser example whose selected sources do not include the mailbox configuration snapshot.

**Consequence:** the user can misunderstand both what is collected and what the selected plan can establish.

**Recommendation:** use “Account events for Jan de Vries, with tenant application context”. Show each source as account evidence, tenant context or current snapshot. Build the summary from the selected plan; do not mention mailbox configuration when it is absent. Keep requested history separate from returned coverage.

Evidence: [banner wording](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:1527), [application inventory](/Users/mihaimonte/REPO/triage/BETA/js/collect.js:85), [tenant consent and context](/Users/mihaimonte/REPO/triage/BETA/js/collect.js:147).

### F3 · High · The decision form arrives before the evidence needed to use it

The showcased critical finding has a decision form, a manually entered evidence reference and a containment link, followed by “This finding names no single record”. The page itself marks supporting evidence as partial because most analyzers do not name their records yet.

**Consequence:** the central review task still requires searching another source and copying a reference. The attractive drawer does not yet provide a reliable finding-to-record path.

**Recommendation:** show the observation and supporting records first, then the decision form. Attach a selected record reference automatically. Aggregate findings should link to their supporting record set and relevant window; they should not invent a single-record reference. When no link exists, show “Evidence link missing” and make finding the evidence the next action. Define what “confirmed” means for each finding: an observed configuration change is not automatically confirmed compromise.

Evidence: [finding drawer](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:2034), [page’s declared limitation](/Users/mihaimonte/REPO/triage/review/2026-09-17/workflow-redesign-beta33.html:1757).

### F4 · Medium · A strict sequence can delay useful investigation

While collection runs, the gate blocks every destination except Collect. Individual returned records are inspectable there, which helps, but Review, Respond and Handover remain locked. The Scope example also acknowledges that Everything can take longer than an hour.

**Consequence:** an urgent case can require waiting or stopping collection to begin the organised review or response workflow.

**Recommendation:** initially retain the current collection gate while improving its explanation. Treat review during collection as a separate engineering change: stable snapshots, visible freshness, checkpointing, cancellation, and preservation of analyst decisions are prerequisites. Later, allow read-only review of available evidence while collection continues. Concurrent response needs separate decisions about authorisation, target binding and changes that affect evidence acquisition. Removing the navigation gate alone is insufficient.

Evidence: [collection gate](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:250), [autosave currently skips a busy collection](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:412).

### F5 · Medium · Repeated context competes with the next decision

The step appears in the rail, breadcrumb and page eyebrow. Case information appears in the rail, case bar and target banner. An additional execution strip explains Browser JavaScript or PowerShell even when no task is running. The Review screenshot gives both “Respond” and “Save review” strong button emphasis despite the page’s one-primary-action rule.

**Consequence:** important information is present but diluted; the analyst must scan several bands before reaching the evidence.

**Recommendation:** one persistent case header containing account, tenant, window, access mode and save state. Keep a compact collection-status strip only when useful. Put engine and diagnostic details behind a disclosure. Within Review, make Save decision the primary action and response planning a secondary action. Keep a larger scope confirmation before starting collection.

Evidence: [rendered review frame](/Users/mihaimonte/REPO/triage/review/2026-09-17/workflow-redesign-beta33.html:905), [declared primary-action rule](/Users/mihaimonte/REPO/triage/review/2026-09-17/workflow-redesign-beta33.html:1717).

### F6 · Medium · The connection promise is stronger than the documented behaviour

“Sign in once. Then nothing interrupts you” conflicts with the same document’s outstanding desktop response sign-in and source labels that announce an Azure sign-in when collection starts. The page’s rule that sign-in happens on Connect also lists response exceptions.

**Consequence:** an expected prompt looks like a broken workflow.

**Recommendation:** say “Connect the services this case needs”. Before collection, show connected services and any expected additional sign-ins. Retain explicit response permission requests. Avoid promising a fixed number of windows unless all selected paths meet that promise.

Evidence: [Connect heading](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:886), [Azure source wording](/Users/mihaimonte/REPO/triage/BETA/js/desk.js:1170), [desktop response limitation](/Users/mihaimonte/REPO/triage/review/2026-09-17/workflow-redesign-beta33.html:1759).

### F7 · Medium · The review document needs a clearer presentation mode

The document is a useful visual record, but its embedded screens are static captures. It disables pointer events while leaving hundreds of native controls in the markup. Its generator removes IDs and label/control associations. At narrow document widths, most embedded screens are scaled to 60%, making already small text harder to read. The product’s phone rail also hides step status lines, as the status table acknowledges.

**Consequence:** the document looks interactive without supporting the workflow, and its screenshots cannot establish product accessibility or interaction quality.

**Recommendation:** label frames “Static capture”, make nonfunctional captures inert, and offer full-size views. For an interactive preview, preserve unique IDs and their accessibility relationships and provide deliberate local interactions. In the product, replace the scrolling phone rail with a current-step button that exposes all seven states. Inspect product accessibility separately from this generated document.

Evidence: [capture behaviour](/Users/mihaimonte/REPO/triage/review/2026-09-17/workflow-redesign-beta33.html:47), [small-screen scaling](/Users/mihaimonte/REPO/triage/review/2026-09-17/workflow-redesign-beta33.html:80), [generator relationship removal](/Users/mihaimonte/REPO/triage/tools/workflow-page/make-workflow-page.mjs:46), [phone limitation](/Users/mihaimonte/REPO/triage/review/2026-09-17/workflow-redesign-beta33.html:1762).

## Options

| Option | Change | Best fit | Cost / tradeoff |
|---|---|---|---|
| **1 · Refine BETA 33** | Keep the layout and workflow; fix states and scope copy, reduce repeated text, improve the evidence drawer and mobile navigation. | Fast improvement with familiar screens. | Smallest layout change; the rigid collection sequence remains. Evidence linking still requires analyzer work. |
| **2 · Guided case workspace — recommended** | Keep all seven steps, group them visually into Prepare, Investigate and Act & transfer; use one case header, persistent gaps and an evidence-first decision panel. | Mixed-experience analysts who need guidance and efficient review. | Moderate UI change plus the same evidence/state work. Can ship without introducing concurrent response. |
| **3 · Parallel operations workspace** | Use Collect, Review, Respond and Handover as concurrent work areas after preparation; show collection progress globally. | Experienced responders working on long-running cases. | Largest engineering and validation scope: snapshots, persistence, stale results and response concurrency. Requires more than navigation changes. |

Options 1–3 are presentation/workflow choices, not alternatives to fixing F1–F3. Those correctness issues apply to every option.

## Advice for implementation

1. **Correct meanings first:** F1, F2 and F6. Write explicit rules for completion, scope and additional authentication before changing layout.
2. **Make review reliable:** F3. Link analyzer findings to stable case records, handle aggregate findings and validate references after export/import.
3. **Apply Option 2:** simplify the header, group the existing seven steps, put evidence before decisions, and expose mobile step states. Preserve case routes, drafts and outstanding work.
4. **Evaluate concurrency separately:** F4 and Option 3. Validate collection persistence, snapshot freshness and any interaction with response actions before opening those routes during collection.

My design rule for further work: optimise for “What do we know, what is missing, what is the next decision?” Do not make every visited screen look complete. Keep the existing identity and use colour mainly for selection, severity and actionable uncertainty.

## Mockup and validation

The interactive concept demonstrates Option 2 with a fictional case. It includes finding selection, original evidence, attached references, saved decisions, draft preservation, explicit partial collection states, response-plan recording and a handover flow that separates package preparation from transfer. Navigation and inspector placement can be adjusted through the design controls.

The prototype deliberately uses three illustrative findings. It does not implement real collection, analyzer reference generation, write authorisation, response execution, file export or recipient acknowledgement. Those remain application work. “Record plan” and “Record handover” only update the mockup.

Local validation: **26 checks passed**, including layouts at 1024, 736, 390 and 320 px, mobile step navigation, all three navigation presentations, evidence selection, decision progress and handover semantics. No external requests or browser JavaScript errors occurred. Desktop light/dark and mobile screenshots were visually inspected. This does not establish accessibility conformance, production behaviour or live tenant access.

Supporting outputs are in `review/2026-09-18/qa/`: `validation.json`, the verification script and rendered screenshots. The interactive source is `workflow-mockup.html`.
