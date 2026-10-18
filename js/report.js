// Report rendering + exports.
(function () {
  const SEVMETA = {
    Critical: { v: "--sev-critical", icon: "⚠" },
    High: { v: "--sev-high", icon: "▲" },
    Medium: { v: "--sev-medium", icon: "◆" },
    Low: { v: "--sev-low", icon: "●" },
    Info: { v: "--sev-info", icon: "ℹ" }
  };
  const SEV = ["Critical", "High", "Medium", "Low", "Info"];
  let findings = [], evidence = null;
  const activeSev = {};

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function col(name) { return "var(" + name + ")"; }

  function show(ev, F) {
    evidence = ev; findings = F;
    ev.analysis={engine:"quick",ruleVersion:window.TRIAGE_BUILD,findings:F};
    document.getElementById("repUpn").textContent = ev.upn;
    document.getElementById("repMeta").textContent =
      (ev.imported ? "Imported evidence" : (ev.days === 1 ? "Last 24 hours" : "Last " + ev.days + " days")) +
      " · " + (ev.signIns || []).length + " sign-ins · " +
      (ev.ualRecords || []).length + " audit events" +
      (ev.skipped && ev.skipped.length ? " · skipped: " + ev.skipped.join(", ") : "") +
      (ev.demo ? " · DEMO DATA" : "");

    // tiles
    const counts = {};
    SEV.forEach(function (s) { counts[s] = 0; });
    F.forEach(function (f) { counts[f.Severity]++; });
    const tiles = [
      { v: F.length, l: "total findings" },
      { v: counts.Critical, l: "critical", sev: "Critical" },
      { v: counts.High, l: "high", sev: "High" },
      { v: (ev.signIns || []).length, l: "sign-in events" },
      { v: (ev.ualRecords || []).length, l: "audit log events" }
    ];
    document.getElementById("tiles").innerHTML = tiles.map(function (t) {
      let v = esc(String(t.v));
      if (t.sev) v = '<span class="icon" style="color:' + col(SEVMETA[t.sev].v) + '">' + SEVMETA[t.sev].icon + "</span>" + v;
      return '<div class="tile"><div class="v num">' + v + '</div><div class="l">' + esc(t.l) + "</div></div>";
    }).join("");

    // severity bar + legend + chips
    const bar = document.getElementById("sevbar");
    bar.innerHTML = "";
    const legend = [];
    const chips = document.getElementById("sevchips");
    chips.innerHTML = "";
    SEV.forEach(function (s) { delete activeSev[s]; });
    SEV.forEach(function (s) {
      if (!counts[s]) return;
      const d = document.createElement("div");
      d.style.background = col(SEVMETA[s].v);
      d.style.flexGrow = counts[s];
      d.style.flexBasis = "0";
      d.title = s + ": " + counts[s];
      bar.appendChild(d);
      legend.push('<span class="sev"><span class="dot" style="background:' + col(SEVMETA[s].v) + '"></span>' +
        s + ' <span class="muted num">' + counts[s] + "</span></span>");
      const b = document.createElement("button");
      b.className = "chip";
      b.innerHTML = SEVMETA[s].icon + " " + s + " (" + counts[s] + ")";
      b.addEventListener("click", function () {
        activeSev[s] = !activeSev[s];
        b.classList.toggle("on", !!activeSev[s]);
        render();
      });
      chips.appendChild(b);
    });
    document.getElementById("sevlegend").innerHTML = legend.join("&nbsp;&nbsp;&nbsp;");

    // categories
    const catsel = document.getElementById("catsel");
    catsel.innerHTML = '<option value="">All categories</option>';
    Array.from(new Set(F.map(function (f) { return f.Category; }))).sort().forEach(function (c) {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      catsel.appendChild(o);
    });

    // profile card
    const u = evidence.user || {};
    const kv = [
      ["Display name", u.displayName], ["UPN", u.userPrincipalName],
      ["Account enabled", u.accountEnabled], ["Created", (u.createdDateTime || "").slice(0, 10)],
      ["Last password change", (u.lastPasswordChangeDateTime || "").slice(0, 10)],
      ["Job title", u.jobTitle], ["Department", u.department]
    ].filter(function (p) { return p[1] !== undefined && p[1] !== null && p[1] !== ""; });
    if (kv.length) {
      document.getElementById("profileCard").style.display = "";
      document.getElementById("profileKv").innerHTML = kv.map(function (p) {
        return "<dt>" + esc(p[0]) + "</dt><dd>" + esc(String(p[1])) + "</dd>";
      }).join("");
    }
    let coverage=document.getElementById('quickCoverage');
    if(!coverage){coverage=document.createElement('div');coverage.id='quickCoverage';coverage.className='warning';document.getElementById('repMeta').after(coverage);}
    const sources=Object.entries(ev.quickManifest || ev.manifest || {});
    coverage.textContent=ev.demo?'Demo evidence — illustrative coverage.':sources.length?sources.map(([k,v])=>k+': '+v.state).join(' · '):'Source coverage unverified. No findings does not establish that the account is safe.';
    render();
  }

  function render() {
    const anySev = SEV.some(function (s) { return activeSev[s]; });
    const cat = document.getElementById("catsel").value;
    const q = document.getElementById("fq").value.toLowerCase();
    const tb = document.getElementById("frows");
    tb.innerHTML = "";
    let shown = 0;
    findings.forEach(function (f) {
      if (anySev && !activeSev[f.Severity]) return;
      if (cat && f.Category !== cat) return;
      if (q && (f.Title + " " + f.Detail + " " + f.Category).toLowerCase().indexOf(q) === -1) return;
      shown++;
      const m = SEVMETA[f.Severity];
      const tr = document.createElement("tr");
      tr.className = "frow";
      tr.tabIndex=0; tr.setAttribute("role","button"); tr.setAttribute("aria-expanded","false");
      tr.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();tr.click();}});
      tr.innerHTML =
        '<td><span class="sev"><span class="dot" style="background:' + col(m.v) + '"></span>' + f.Severity + "</span></td>" +
        "<td><strong>" + esc(f.Title) + '</strong><div class="muted mini">' + esc(f.Category) + "</div></td>" +
        '<td class="num mini">' + esc(f.Timestamp) + "</td>";
      const sourceKey=/Audit log/i.test(f.Category)?'ualRecords':/Directory/i.test(f.Category)?'directoryAudits':/OAuth/i.test(f.Category)?'oauthGrants':/Risk/i.test(f.Category)?'riskDetections':'signIns';
      const related=(evidence[sourceKey]||[]).filter(r=>!f._t || (r.createdDateTime||r.activityDateTime||r.detectedDateTime)===f._t);
      const disposition=evidence.dispositions?.[f.Id] || {status:'Needs review',note:''};
      const dr = document.createElement("tr");
      dr.className = "detail-row";
      dr.style.display = "none";
      // Details are plain text; newlines carry structure (e.g. the MFA method
      // list), so render them as line breaks.
      dr.innerHTML = '<td colspan="3">' + esc(f.Detail).replace(/\n/g, "<br>") +
        (f.Recommendation ? '<div class="rec"><strong>Recommended action:</strong> ' + esc(f.Recommendation) + "</div>" : "") +
        '<div class="src muted">Source: ' + esc(f.Source) + "</div></td>";
      const cell=dr.querySelector('td');
      cell.insertAdjacentHTML('beforeend','<p class="mini">Reference: '+esc(f.Id)+' · '+esc(f.Confidence)+'</p><details><summary>Related evidence ('+related.length+')</summary><p class="mini">Same-time source context, not proof every record triggered this finding. First 10 shown; the case retains all records.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(related.slice(0,10),null,2))+'</pre></details>');
      const label=document.createElement('label');label.textContent='Disposition';const select=document.createElement('select');
      ['Needs review','Suspicious','Expected activity','Resolved'].forEach(value=>{const o=document.createElement('option');o.textContent=value;select.append(o);});select.value=disposition.status;label.append(select);cell.append(label);
      const noteLabel=document.createElement('label');noteLabel.textContent='Analyst note';const note=document.createElement('textarea');note.value=disposition.note;noteLabel.append(note);cell.append(noteLabel);
      const save=()=>{evidence.dispositions ||= {};evidence.dispositions[f.Id]={status:select.value,note:note.value,updatedAt:new Date().toISOString()};};select.onchange=save;note.oninput=save;
      tr.addEventListener("click", function () {
        dr.style.display = dr.style.display === "none" ? "" : "none";
        tr.setAttribute("aria-expanded",String(dr.style.display !== "none"));
      });
      tb.appendChild(tr);
      tb.appendChild(dr);
    });
    document.getElementById("fempty").style.display = shown ? "none" : "";
  }

  function download(name, mime, content) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function stamp() { return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ""); }

  function exportFindingsCsv() {
    const cols = ["Severity", "Category", "Title", "Detail", "User", "Timestamp", "Source", "Recommendation"];
    const lines = [cols.join(",")];
    findings.forEach(function (f) {
      lines.push(cols.map(function (c) {
        return '"' + String(f[c] == null ? "" : f[c]).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
      }).join(","));
    });
    download("LimonTriage-" + (evidence.upn || "user") + "-" + stamp() + ".csv",
      "text/csv;charset=utf-8", "﻿" + lines.join("\r\n"));
  }
  async function exportEvidenceJson() {
    const copy = Object.assign({}, evidence, { findings: findings, generated: new Date().toISOString(),
      tool: "Limon-IT M365 Triage build " + window.TRIAGE_BUILD });
    download("LimonTriage-evidence-" + (evidence.upn || "user") + "-" + stamp() + ".json",
      "application/json", JSON.stringify(await window.TriageCase.bundle({...copy,actionHistory:window.TriageCase.same(window.TriageContain?.identity,window.TriageCase.identity(copy)) ? window.TriageContain.history : copy.actionHistory || []}), null, 1));
  }

  document.getElementById("catsel").addEventListener("change", render);
  document.getElementById("fq").addEventListener("input", render);
  document.getElementById("dlFindingsBtn").addEventListener("click", exportFindingsCsv);
  document.getElementById("dlEvidenceBtn").addEventListener("click", exportEvidenceJson);
  document.getElementById("printBtn").addEventListener("click", function () { window.print(); });

  window.TriageReport = { show: show };
})();
