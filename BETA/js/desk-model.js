/* Case decisions are analyst statements. Collection never executes containment. */
(function () {
  "use strict";
  const E = window.BETA_Evidence;
  const phases = [
    {
      id: "preserve",
      title: "Confirm & preserve",
      minutes: "00–12",
      description:
        "Establish what happened, who owns the incident, and what must be preserved.",
      steps: [
        [
          "Confirm the signal",
          "Record the alert, affected account, incident owner and UTC start time.",
        ],
        [
          "Check access and coverage",
          "Confirm the tenant and account. Record missing permissions, retention and unavailable sources.",
        ],
        [
          "Preserve the starting point",
          "Collect sign-ins, audit events and current account state. Export a case before response changes.",
        ],
      ],
    },
    {
      id: "contain",
      title: "Contain & record",
      minutes: "12–24",
      description:
        "Record authorized response in the system where it was performed, and the evidence that confirms its result.",
      steps: [
        [
          "Decide on account access",
          "Consider sign-in restrictions, session revocation and a credential reset with the incident owner.",
        ],
        [
          "Review authentication and consent",
          "Check MFA changes, OAuth consent and application access. Record the approved response and its result.",
        ],
        [
          "Review mailbox persistence",
          "Inspect hidden rules, forwarding, delegates and audit configuration with the portable collector. Record preservation exceptions.",
        ],
      ],
    },
    {
      id: "scope",
      title: "Establish impact",
      minutes: "24–36",
      description:
        "Understand the affected identities, access paths and data before drawing a conclusion.",
      steps: [
        [
          "Reconstruct the timeline",
          "Correlate interactive and background sign-ins with directory changes and Unified Audit Log events.",
        ],
        [
          "Follow related identities",
          "Review privileged roles, application identities, grants and devices. Start a separate case for another tenant.",
        ],
        [
          "Assess mailbox and data access",
          "Look for suspicious rules, sharing and file activity. Record what the evidence cannot establish.",
        ],
      ],
    },
    {
      id: "evidence",
      title: "Preserve & export evidence",
      minutes: "36–48",
      description:
        "Make the collection reproducible and make its limits visible.",
      steps: [
        [
          "Check every source",
          "Resolve or document failed, partial, unavailable and uncollected sources. A completed query does not prove full historical retention.",
        ],
        [
          "Review findings",
          "Distinguish signals, confirmed findings and benign explanations. Link decisions to source records.",
        ],
        [
          "Preserve a complete case",
          "Export raw records, source states, finding reviews and the action log together. Record the case hash when handing over.",
        ],
      ],
    },
    {
      id: "handover",
      title: "Communicate & hand over",
      minutes: "48–60",
      description:
        "Give the next responder the evidence, current decisions and a clear next action.",
      steps: [
        [
          "Summarize the incident",
          "State what is established, what is suspected and the remaining business risk.",
        ],
        [
          "Assign follow-up",
          "Record an owner and a due time for each evidence gap and outstanding verification.",
        ],
        [
          "Deliver the handover",
          "Export the case and handover note. Record the recipient, channel and next update time; sending happens outside this collector.",
        ],
      ],
    },
  ];
  const actions = [
    "note",
    "response-result",
    "phase-outcome",
    "finding-review",
    "collection-start",
    "source-result",
    "collection-end",
    "case-opened",
    "case-exported",
    "case-saved",
    "plan-exported",
    "handover-exported",
    "handover-recorded",
    "log-exported",
    "response-connect",
    "collection-error",
  ];
  function init(ev) {
    if (!Array.isArray(ev.actionLog)) ev.actionLog = [];
    ev.dispositions ||= {};
    return ev;
  }
  function append(ev, type, detail, actor = "Local analyst", extra = {}) {
    init(ev);
    if (!actions.includes(type)) throw Error("Unknown action type");
    if (typeof detail !== "string" || !detail.trim())
      throw Error("Add a description");
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      caseId: ev.caseId,
      tenantId: ev.tenantId,
      subject: ev.subject?.upn || "Tenant",
      actor: String(actor).slice(0, 200),
      type,
      detail: detail.trim().slice(0, 12000),
    };
    for (const k of [
      "phase",
      "outcome",
      "reference",
      "findingId",
      "source",
      "state",
      "recipient",
      "channel",
    ])
      if (extra[k] !== undefined) entry[k] = String(extra[k]).slice(0, 500);
    ev.actionLog.push(entry);
    return entry;
  }
  function ref(ev, reference) {
    const match = /^([A-Za-z]+):(\d+)$/.exec(reference || "");
    if (!match || !E.CATALOG.some((x) => x[0] === match[1])) return null;
    return ev.raw[match[1]]?.[Number(match[2]) - 1] || null;
  }
  function outcome(ev, phase, state, detail, reference, actor) {
    if (!phases.some((p) => p.id === phase))
      throw Error("Unknown runbook phase");
    if (!["pending", "in-progress", "verified", "exception"].includes(state))
      throw Error("Choose a valid outcome");
    if (state === "verified" && !ref(ev, reference))
      throw Error(
        "A verified outcome needs an existing evidence reference, for example interactive:1. Import verification evidence first.",
      );
    return append(ev, "phase-outcome", detail, actor, {
      phase,
      outcome: state,
      reference,
    });
  }
  function latest(ev, phase) {
    return [...(ev.actionLog || [])]
      .reverse()
      .find((e) => e.type === "phase-outcome" && e.phase === phase);
  }
  function reviewState(ev, finding) {
    const d = ev.dispositions?.[finding.Id];
    if (!d?.note?.trim() || (d.state === "confirmed" && !ref(ev, d.reference))) return "unreviewed";
    return ["confirmed", "benign", "investigating"].includes(d.state) ? d.state : "unreviewed";
  }
  function reviewProgress(ev, findings) {
    const states = findings.map(f => reviewState(ev, f));
    const resolved = states.filter(s => ["confirmed", "benign"].includes(s)).length;
    return { total: states.length, resolved, investigating: states.filter(s => s === "investigating").length, outstanding: states.length - resolved };
  }
  function phaseProgress(ev) {
    const outcomes = phases.map(p => latest(ev, p.id));
    const closed = o => !!o?.detail?.trim() && (o.outcome === "exception" || (o.outcome === "verified" && !!ref(ev, o.reference)));
    return { total: phases.length, resolved: outcomes.filter(closed).length, exceptions: outcomes.filter(o => closed(o) && o.outcome === "exception").length };
  }
  function handoverRecord(ev) {
    return (ev.actionLog || []).findLast(e => e.type === "handover-recorded" && e.recipient?.trim() && e.channel?.trim() && e.detail?.trim());
  }
  function recordHandover(ev, recipient, channel, detail, actor) {
    if (!recipient?.trim()) throw Error("Name the next owner or team.");
    if (!channel?.trim()) throw Error("Record how the handover was made.");
    if (!detail?.trim()) throw Error("Record what was handed over and the next action.");
    return append(ev, "handover-recorded", `Handover to ${recipient.trim()} via ${channel.trim()}. ${detail.trim()}`, actor, { recipient: recipient.trim(), channel: channel.trim() });
  }
  function review(ev, findingId, state, note, reference, actor) {
    if (!["unreviewed", "investigating", "confirmed", "benign"].includes(state))
      throw Error("Invalid finding review");
    if (state === "confirmed" && !ref(ev, reference))
      throw Error("A confirmed finding needs an existing evidence reference.");
    append(ev, "finding-review", note, actor, {
      findingId,
      outcome: state,
      reference,
    });
    ev.dispositions[findingId] = {
      state,
      note,
      reference,
      actor,
      at: new Date().toISOString(),
    };
  }
  function timeline(ev) {
    return Object.entries(ev.raw)
      .flatMap(([key, rows]) =>
        rows.map((r, i) => ({
          key,
          reference: key + ":" + (i + 1),
          row: r,
          time:
            r.createdDateTime ||
            r.activityDateTime ||
            r.CreationTime ||
            r.creationDateTime ||
            r.detectedDateTime ||
            r.capturedAt ||
            "",
          title:
            r.activityDisplayName ||
            r.operation ||
            r.Operation ||
            r.appDisplayName ||
            r.displayName ||
            r.riskEventType ||
            key,
          user:
            r.userPrincipalName ||
            r.UserId ||
            r.initiatedBy?.user?.userPrincipalName ||
            r.upn ||
            "",
        })),
      )
      .filter((x) => x.time && !isNaN(Date.parse(x.time)))
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  }
  function csv(ev) {
    const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const keys = [
      "at",
      "actor",
      "type",
      "detail",
      "phase",
      "outcome",
      "reference",
      "caseId",
      "recipient",
      "channel",
      "tenantId",
      "subject",
    ];
    return [keys, ...(ev.actionLog || []).map((e) => keys.map((k) => e[k]))]
      .map((r) => r.map(cell).join(","))
      .join("\r\n");
  }
  function handover(ev, findings) {
    const c = E.coverage(ev);
    return [
      "# Triage handover",
      "",
      `Case: ${ev.caseId}`,
      `Tenant: ${ev.tenantName} (${ev.tenantId || "unverified"})`,
      `Subject: ${ev.subject?.upn || "Tenant-wide"}`,
      `Collection method: ${ev.collectionMethod === "powershell" ? "PowerShell" : ev.collectionMethod === "browser-js" ? "Browser JavaScript" : "Not recorded"}`,
      `Window: ${ev.window?.start || "Unverified"} to ${ev.window?.end || "Unverified"}`,
      `Exported: ${new Date().toISOString()}`,
      handoverRecord(ev)
        ? `Handover recorded: ${handoverRecord(ev).at} to ${handoverRecord(ev).recipient} via ${handoverRecord(ev).channel}. Analyst-authored; recipient acceptance is not verified.`
        : "Handover not recorded. Exporting this note does not transfer ownership.",
      "",
      "## Assessment",
      `${findings.length} automated signals; ${findings.filter((f) => reviewState(ev, f) === "confirmed").length} confirmed by an analyst. Signals require review.`,
      ...(E.userScope(ev) && ev.oauthGrants?.length
        ? [
            `OAuth scope: ${E.oauthSummary(ev).user} user-specific grants; tenant-wide and unrelated grants remain in Evidence and do not contribute to this account's OAuth findings. Previous reviews remain in the action log.`,
          ]
        : []),
      "",
      "## Findings and decisions",
      ...findings.map((f) => {
        const d = ev.dispositions?.[f.Id];
        return `- **${f.Severity} — ${f.Title}**\n  - Account: ${f.User || "Tenant context"}; time: ${f.Timestamp || "Current state"}\n  - Facts: ${f.Detail || "Inspect source evidence"}\n  - Review: ${reviewState(ev, f)}${d?.note ? " — " + d.note : ""}${d?.reference ? " [" + d.reference + "]" : ""}`;
      }),
      "",
      "## Outstanding work",
      ...findings
        .filter(
          (f) =>
            ["unreviewed", "investigating"].includes(reviewState(ev, f)),
        )
        .map((f) => `- Review ${f.Id}: ${f.Title} — owner not assigned`),
      "",
      "## Evidence coverage",
      ...c.all.map(
        (s) =>
          `- ${s.label}: ${s.state}, ${s.count} records${s.error ? " — " + s.error : ""}`,
      ),
      "",
      "## First 60 minutes",
      ...phases.map((p) => {
        const o = latest(ev, p.id);
        return `- ${p.minutes} ${p.title}: ${o?.outcome === "verified" ? "analyst reviewed (not execution verification)" : o?.outcome || "pending"}${o ? " — " + o.detail : ""}${o?.reference ? " [" + o.reference + "]" : ""}`;
      }),
      "",
      "## Action log (analyst-authored; not a signed audit ledger)",
      ...(ev.actionLog || []).map(
        (e) =>
          `- ${e.at} | ${e.actor} | ${e.type}: ${e.detail}${e.reference ? " [" + e.reference + "]" : ""}`,
      ),
      "",
    ].join("\n");
  }
  function plan(values, ev) {
    const guid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guid.test(values.tenantId || ""))
      throw Error("Enter the target tenant ID (GUID).");
    if (
      values.scope === "user" &&
      !/^[^\s@'<>]+@[^\s@'<>]+\.[^\s@'<>]+$/.test(values.upn || "")
    )
      throw Error("Enter a valid affected account.");
    const start = new Date(values.start),
      end = new Date(values.end);
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      start >= end ||
      end - start > 180 * 864e5
    )
      throw Error("Choose a valid UTC interval of up to 180 days.");
    const selected = [...new Set(values.sources || [])];
    if (
      !selected.length ||
      selected.some((k) => !E.CATALOG.some((c) => c[0] === k))
    )
      throw Error("Select supported evidence sources.");
    if (selected.includes("exchange") && values.scope !== "user")
      throw Error("Mailbox collection requires one affected account.");
    return {
      schema: "limon.triage.plan",
      schemaVersion: 1,
      caseId:
        values.caseId && guid.test(values.caseId)
          ? values.caseId
          : crypto.randomUUID(),
      tenantId: values.tenantId,
      scope: values.scope === "tenant" ? "tenant" : "user",
      upn: values.scope === "tenant" ? "" : values.upn,
      window: { start: start.toISOString(), end: end.toISOString() },
      sources: selected,
    };
  }
  window.TriageDeskModel = {
    phases,
    init,
    append,
    ref,
    outcome,
    latest,
    reviewState,
    reviewProgress,
    phaseProgress,
    handoverRecord,
    recordHandover,
    review,
    timeline,
    csv,
    handover,
    plan,
  };
})();
