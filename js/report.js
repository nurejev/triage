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
      tr.innerHTML =
        '<td><span class="sev"><span class="dot" style="background:' + col(m.v) + '"></span>' + f.Severity + "</span></td>" +
        "<td><strong>" + esc(f.Title) + '</strong><div class="muted mini">' + esc(f.Category) + "</div></td>" +
        '<td class="num mini">' + esc(f.Timestamp) + "</td>";
      const dr = document.createElement("tr");
      dr.className = "detail-row";
      dr.style.display = "none";
      dr.innerHTML = '<td colspan="3">' + esc(f.Detail) +
        (f.Recommendation ? '<div class="rec"><strong>Recommended action:</strong> ' + esc(f.Recommendation) + "</div>" : "") +
        '<div class="src muted">Source: ' + esc(f.Source) + "</div></td>";
      tr.addEventListener("click", function () {
        dr.style.display = dr.style.display === "none" ? "" : "none";
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
        return '"' + String(f[c] == null ? "" : f[c]).replace(/"/g, '""') + '"';
      }).join(","));
    });
    download("LimonTriage-" + (evidence.upn || "user") + "-" + stamp() + ".csv",
      "text/csv;charset=utf-8", "﻿" + lines.join("\r\n"));
  }
  function exportEvidenceJson() {
    const copy = Object.assign({}, evidence, { findings: findings, generated: new Date().toISOString(),
      tool: "Limon-IT M365 Triage build " + window.TRIAGE_BUILD });
    download("LimonTriage-evidence-" + (evidence.upn || "user") + "-" + stamp() + ".json",
      "application/json", JSON.stringify(copy, null, 1));
  }

  document.getElementById("catsel").addEventListener("change", render);
  document.getElementById("fq").addEventListener("input", render);
  document.getElementById("dlFindingsBtn").addEventListener("click", exportFindingsCsv);
  document.getElementById("dlEvidenceBtn").addEventListener("click", exportEvidenceJson);
  document.getElementById("printBtn").addEventListener("click", function () { window.print(); });

  window.TriageReport = { show: show };
})();
