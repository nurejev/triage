// ======================================================================
//  Communication and evidence templates.
//
//  The communication window (48-60 min) is the one people improvise, and
//  improvising is where the mistakes live: mailing the compromised mailbox
//  to say the mailbox is compromised, telling leadership more than the
//  facts support, or leaving the DPO to find out on Monday.
//
//  Each template is a markdown file prefilled with what this session
//  already knows - the account, the timeline, what was contained, what the
//  checks flagged - so the analyst edits rather than writes.
//
//  Facts in, markdown out. No network, no state.
// ======================================================================
(function () {
  function line(s) { return s == null ? "" : String(s); }
  function bullets(a) { return a.length ? a.map(function (x) { return "- " + x; }).join("\n") : "- _(nothing recorded)_"; }
  function hdr(f, title) {
    return "# " + title + "\n\n" +
      "| | |\n|---|---|\n" +
      "| **Account** | " + f.upn + (f.displayName ? " (" + f.displayName + ")" : "") + " |\n" +
      "| **Prepared by** | " + f.operator + " |\n" +
      "| **Prepared** | " + f.now + " UTC |\n" +
      "| **Incident ref** | _fill in_ |\n" +
      (f.demo ? "\n> **DEMO DATA — this is a simulated incident, nothing below is real.**\n" : "") +
      "\n";
  }
  // What we can state as fact, versus what is still unknown. Keeping those
  // apart is most of the job in the first hour.
  function known(f) {
    const out = [];
    if (f.flagged.length) out.push("Checks that flagged: " + f.flagged.join("; "));
    if (f.topFindings.length) f.topFindings.forEach(function (t) { out.push(t); });
    if (!out.length) out.push("_No confirmed findings recorded in this session yet._");
    return out;
  }
  function contained(f) {
    const done = f.steps.filter(function (s) { return s.status === "done"; });
    return done.length ? done.map(function (s) { return s.title; }) : ["_Nothing contained yet._"];
  }
  const UNKNOWNS =
    "- Whether data was exfiltrated, and which data\n" +
    "- Whether other accounts were reached from this one\n" +
    "- The initial access vector (that is a root-cause question, not a first-hour one)\n" +
    "- Whether any notification threshold is met — legal and the DPO decide that, not us";

  const T = {
    // ---------------------------------------------------------------- user --
    user: function (f) {
      return hdr(f, "Out-of-band call script — " + f.upn) +
        "> **Call them. Do not email them and do not message them in Teams.**\n" +
        "> If the mailbox or Teams account is compromised, the attacker reads the warning too — and gets\n" +
        "> the chance to social-engineer the user before you do.\n\n" +
        "**Number to call:** _____________________  \n" +
        "_Get it from HR or the directory, not from the compromised mailbox — an attacker can change a\n" +
        "signature block or a contact card._\n\n" +
        "**Time of call (UTC):** _____________\n\n" +
        "## What to say — about twenty seconds\n\n" +
        "> \"Hi " + (f.firstName || "[name]") + ", it's " + f.operator + " from IT.\n" +
        "> We've seen suspicious activity on your account, so I've temporarily restricted your access.\n" +
        "> You haven't done anything wrong.\n" +
        "> I'll call you back on this number within the hour to get you signed back in properly.\n" +
        "> In the meantime: please don't act on any email or message that says it's from IT — including\n" +
        "> anything asking you to approve a sign-in or hand over a code.\"\n\n" +
        "Stop there. Twenty seconds, not a paragraph.\n\n" +
        "## What not to say\n\n" +
        "- Do not speculate about how it happened. You do not know yet.\n" +
        "- Do not say \"you've been hacked\" — it invites panic and a flurry of self-help that destroys evidence.\n" +
        "- Do not ask them to \"just change their password\" themselves; the reset goes through your controlled process.\n" +
        "- Do not promise a restoration time you cannot keep.\n\n" +
        "## Ask them (short, and only if they are calm)\n\n" +
        "- Did you approve any sign-in prompt you did not start, in the last few days?\n" +
        "- Did you sign in anywhere unusual, or use any new app or browser extension?\n" +
        "- Have you received anything odd — an unexpected file, a login page, a call claiming to be IT?\n" +
        "- Are you expecting any payment or invoice conversation right now?\n\n" +
        "_Write the answers down verbatim. They are the first thread of the root-cause investigation,\n" +
        "and memory degrades fast._\n\n" +
        "## After the call\n\n" +
        "- [ ] Note the time, the number reached and who answered in the communication log\n" +
        "- [ ] Tell the manager (separate template)\n" +
        "- [ ] Agree the call-back time and keep it\n";
    },

    // ------------------------------------------------------------- manager --
    manager: function (f) {
      return hdr(f, "Manager brief — " + f.upn) +
        "**Manager:** _____________________ **Contacted (UTC):** ___________ **Channel:** phone / in person\n\n" +
        "## What has happened\n\n" +
        "We have identified suspicious activity on " + f.upn + " and treated it as a compromised account.\n" +
        "Their access is temporarily restricted while we contain and investigate. This is a precaution taken\n" +
        "on our judgement — it is not a disciplinary matter and the user has not necessarily done anything wrong.\n\n" +
        "## What we have done\n\n" + bullets(contained(f)) + "\n\n" +
        "## What this means for them today\n\n" +
        "- They cannot sign in until we restore access through a controlled process.\n" +
        "- Anything running as that account — scheduled jobs, shared mailbox access, delegated calendars — has stopped.\n" +
        "- We will restore access once containment is verified, not on a fixed clock. Realistically: _____ hours.\n\n" +
        "## What we need from you\n\n" +
        "1. **Cover anything urgent** — is this person mid-deal, mid-presentation, or the only approver for something today?\n" +
        "2. **Context we do not have.** Anything unusual recently: a vendor screen-share, travel, a new supplier,\n" +
        "   a payment conversation, an odd request they mentioned. Small details change the investigation.\n" +
        "3. **Do not discuss it in email or Teams with them** until we confirm those channels are clean.\n\n" +
        "## What we do not know yet\n\n" + UNKNOWNS + "\n\n" +
        "I will update you at _______ (UTC).\n";
    },

    // -------------------------------------------------------- security lead --
    security: function (f) {
      const done = f.steps.filter(function (s) { return s.status === "done"; }).length;
      return hdr(f, "Security lead / CISO status — " + f.upn) +
        "> Calibrated for someone with thirty seconds. Facts only — do not embellish, do not soften.\n\n" +
        "## One paragraph\n\n" +
        "One user account, " + f.upn + ", is being treated as compromised as of " + f.now + " UTC. " +
        "Suspected vector: **_____________** (fill in: AiTM session theft / OAuth consent phishing / MFA fatigue / " +
        "password spray / unknown). Containment is " + (done >= 4 ? "complete" : "in progress") + " — " +
        bullets(contained(f)).replace(/^- /gm, "").split("\n").join(", ") + ". " +
        "Blast-radius mapping is " + (f.blastDone >= 13 ? "complete" : "under way") + " (" + f.blastDone + " of 15 checks). " +
        "Evidence is preserved and exported. Regulatory assessment is pending with the DPO. " +
        "No confirmed data exfiltration at this time" + (f.exfilSignal ? ", **but bulk mailbox or file access is present in the audit log**" : "") + ".\n\n" +
        "## Detail, if they ask\n\n" +
        "**What we found**\n\n" + bullets(known(f)) + "\n\n" +
        "**What we did**\n\n" + bullets(contained(f)) + "\n\n" +
        "**What we do not know yet**\n\n" + UNKNOWNS + "\n\n" +
        "**Decisions I need from you**\n\n" +
        "- [ ] Whether to widen the sweep to other accounts in the same group / department\n" +
        "- [ ] Whether to notify affected external parties (customers, vendors in the mail thread)\n" +
        "- [ ] Who owns the root-cause investigation once containment is signed off\n" +
        "- [ ] Whether this meets the internal threshold for a formal incident declaration\n";
    },

    // ------------------------------------------------------------------ DPO --
    dpo: function (f) {
      return hdr(f, "DPO / privacy lead notification — " + f.upn) +
        "> **This is a heads-up with facts, not an assessment.** Whether this is a notifiable personal data\n" +
        "> breach is your decision, not mine. I am surfacing it early so the decision can be made in time.\n\n" +
        "**Time I became aware (UTC):** " + f.firstAction + "  \n" +
        "**Time you were notified (UTC):** ______________\n\n" +
        "_GDPR Article 33: where notifiable, the supervisory authority must be notified without undue delay\n" +
        "and, where feasible, within 72 hours of awareness. If the organisation is an essential or important\n" +
        "entity under NIS2, an early warning is typically expected within 24 hours. The clock, if it runs,\n" +
        "runs from awareness — hence this note._\n\n" +
        "## The facts as they stand\n\n" + bullets(known(f)) + "\n\n" +
        "## Personal data exposure indicators\n\n" +
        "| Indicator | Present? | Detail |\n|---|---|---|\n" +
        "| Bulk mailbox access (MailItemsAccessed) | " + (f.has("mailitems") ? "**yes** — " + f.summaryOf("mailitems") : "not observed") + " | |\n" +
        "| File downloads from SharePoint / OneDrive | " + (f.has("spo") ? "**yes** — " + f.summaryOf("spo") : "not observed") + " | |\n" +
        "| Mail forwarded to an external address | " + (f.has("forwarding") ? "**yes** — " + f.summaryOf("forwarding") : "not observed") + " | |\n" +
        "| Teams content shared externally | " + (f.has("teams") ? f.summaryOf("teams") : "not observed") + " | |\n" +
        "| Application holding mailbox scopes | " + (f.has("oauth") ? f.summaryOf("oauth") : "not observed") + " | |\n\n" +
        "## What I cannot tell you yet\n\n" +
        "- **Which** data subjects or records were in the accessed mail or files. Audit logs record that access\n" +
        "  happened, not what the content was. Establishing that is a separate exercise.\n" +
        "- Whether the data was read, copied or acted upon.\n" +
        "- Whether special-category data was involved.\n\n" +
        "## Retention caveat\n\n" +
        "Our audit retention is **_____ days** on the licensing this account has. Anything before that window\n" +
        "cannot be reconstructed, whatever the investigation asks for. Please factor that into any statement\n" +
        "about the scope or the period affected.\n\n" +
        "## What I need from you\n\n" +
        "- [ ] Is this a notifiable personal data breach?\n" +
        "- [ ] Does the 72-hour clock start, and from when?\n" +
        "- [ ] Do data subjects need informing (Art. 34), and who drafts that?\n" +
        "- [ ] Does NIS2 or a sector-specific obligation apply here?\n";
    },

    // ----------------------------------------------------------- leadership --
    leadership: function (f) {
      return hdr(f, "Leadership brief — account compromise") +
        "> Follow the standing communication protocol. Do not improvise this call: say the facts, no more\n" +
        "> and no less. Saying more than the evidence supports is the mistake that gets repeated back to you\n" +
        "> in a customer meeting a week later.\n\n" +
        "## Situation\n\n" +
        "A single user account has been compromised. We detected it, contained it, and are mapping what the\n" +
        "attacker could reach. The account belongs to " + (f.displayName || f.upn) + ".\n\n" +
        "## Status right now\n\n" +
        "- **Contained:** " + (f.steps.filter(function (s) { return s.status === "done"; }).length >= 4 ? "yes" : "in progress") + "\n" +
        "- **Blast radius mapped:** " + f.blastDone + " of 15 checks complete\n" +
        "- **Evidence preserved:** yes, exported and attached to the incident record\n" +
        "- **Business impact:** the user is without access until containment is verified\n" +
        "- **Customer or partner impact:** _____________ (state only what is evidenced)\n\n" +
        "## What we are not yet able to say\n\n" + UNKNOWNS + "\n\n" +
        "## What happens next\n\n" +
        "1. Finish the blast-radius list — attackers commonly leave a second persistence mechanism.\n" +
        "2. Restore the user's access through a controlled reset once containment is verified.\n" +
        "3. Root-cause investigation, separately, once containment is signed off.\n" +
        "4. Privacy and regulatory assessment sits with the DPO and legal, who have the facts.\n\n" +
        "## What we need from leadership\n\n" +
        "- [ ] Approval to keep the account disabled until the mapping is finished\n" +
        "- [ ] A decision on external communication, if any is warranted\n" +
        "- [ ] Nothing else right now. The next update is at _______ (UTC).\n\n" +
        "**Please do not forward this brief onward** until the privacy assessment is complete.\n";
    },

    // ----------------------------------------------- communication log (evid) --
    commlog: function (f) {
      return hdr(f, "Communication log — " + f.upn) +
        "> Who was told what, when, and on which channel. If anyone later asks \"when did the user know?\"\n" +
        "> or \"when was leadership informed?\", this is the document that answers it. Fill it in as you go,\n" +
        "> not afterwards from memory.\n\n" +
        "| Time (UTC) | Who | Role | Channel | What they were told | Response |\n" +
        "|---|---|---|---|---|---|\n" +
        "| | " + (f.displayName || "the user") + " | account holder | **phone (out of band)** | access restricted, call-back agreed | |\n" +
        "| | | line manager | phone | status + cover needed | |\n" +
        "| | | security lead / CISO | | one-paragraph status | |\n" +
        "| | | DPO / privacy lead | | facts for the Art. 33 assessment | |\n" +
        "| | | leadership | | per standing protocol | |\n" +
        "| | | | | | |\n\n" +
        "## Channel rule\n\n" +
        "Nothing about this incident goes through the compromised user's mailbox or Teams until those are\n" +
        "confirmed clean. If the compromise reached a shared mailbox or a distribution list, the same applies\n" +
        "to everyone on it.\n\n" +
        "## Technical action log\n\n" +
        "The tenant-side actions are recorded separately — export the action log from the containment screen\n" +
        "and attach both to the incident record. This file covers what was said to people; that one covers\n" +
        "what was done to the tenant.\n";
    }
  };

  window.TriageTemplates = T;
})();
