// Tenant-wide findings report with a per-user drill-down. Same visual language
// as Triage: severity tiles, a severity bar, filter chips, an expandable table.
(function () {
  const SEVMETA = {
    Critical: { v: "--sev-critical", icon: "⚠" },
    High: { v: "--sev-high", icon: "▲" },
    Medium: { v: "--sev-medium", icon: "◆" },
    Low: { v: "--sev-low", icon: "●" },
    Info: { v: "--sev-info", icon: "ℹ" }
  };
  const SEV = ["Critical", "High", "Medium", "Low", "Info"];
  let findings = [], result = null, evidence = null;
  const activeSev = {};
  let userFilter = "";

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function col(n) { return "var(" + n + ")"; }

  function show(ev, res) {
    evidence = ev; result = res; findings = res.findings;
    const srcLabel = ev.imported ? "Imported (" + (ev.sources || []).length + " file" + ((ev.sources || []).length === 1 ? "" : "s") + ")"
      : ev.demo ? "DEMO tenant" : "Live tenant";
    $("betaRepScope").textContent = "Tenant-wide analysis";
    $("betaRepMeta").textContent = srcLabel + " · " + findings.length + " findings · " + res.users.length + " account(s) implicated" +
      (ev.days ? " · last " + ev.days + " days" : "") + (ev.skipped && ev.skipped.length ? " · skipped: " + ev.skipped.join(", ") : "");

    // tiles
    const counts = {}; SEV.forEach(function (s) { counts[s] = 0; });
    findings.forEach(function (f) { counts[f.Severity]++; });
    const tiles = [
      { v: findings.length, l: "total findings" },
      { v: counts.Critical, l: "critical", sev: "Critical" },
      { v: counts.High, l: "high", sev: "High" },
      { v: res.users.length, l: "accounts implicated" },
      { v: (ev.signIns || []).length + (ev.ualRecords || []).length, l: "records analyzed" }
    ];
    $("betaTiles").innerHTML = tiles.map(function (t) {
      let v = esc(String(t.v));
      if (t.sev) v = '<span class="icon" style="color:' + col(SEVMETA[t.sev].v) + '">' + SEVMETA[t.sev].icon + "</span>" + v;
      return '<div class="tile"><div class="v num">' + v + '</div><div class="l">' + esc(t.l) + "</div></div>";
    }).join("");

    // severity bar + chips
    const bar = $("betaSevbar"); bar.innerHTML = "";
    const chips = $("betaSevchips"); chips.innerHTML = "";
    SEV.forEach(function (s) { delete activeSev[s]; });
    SEV.forEach(function (s) {
      if (!counts[s]) return;
      const d = document.createElement("div");
      d.style.background = col(SEVMETA[s].v); d.style.flexGrow = counts[s]; d.style.flexBasis = "0"; d.title = s + ": " + counts[s];
      bar.appendChild(d);
      const b = document.createElement("button");
      b.className = "chip"; b.innerHTML = SEVMETA[s].icon + " " + s + " (" + counts[s] + ")";
      b.addEventListener("click", function () { activeSev[s] = !activeSev[s]; b.classList.toggle("on", !!activeSev[s]); render(); });
      chips.appendChild(b);
    });

    // analyzer coverage
    const analyzers = {};
    findings.forEach(function (f) { analyzers[f.Analyzer] = (analyzers[f.Analyzer] || 0) + 1; });
    $("betaCoverage").innerHTML = Object.keys(analyzers).sort().map(function (a) {
      return '<span class="pill">' + esc(a) + ' <span class="num">' + analyzers[a] + "</span></span>";
    }).join("");

    // per-user rollup table (the MAS "who is compromised" view)
    renderUsers();

    // category filter
    const catsel = $("betaCatsel");
    catsel.innerHTML = '<option value="">All analyzers</option>';
    Object.keys(analyzers).sort().forEach(function (a) { const o = document.createElement("option"); o.value = a; o.textContent = a; catsel.appendChild(o); });

    userFilter = "";
    render();
  }

  function renderUsers() {
    const tb = $("betaUsers");
    tb.innerHTML = result.users.slice(0, 100).map(function (u) {
      const chips = SEV.filter(function (s) { return u[s]; }).map(function (s) {
        return '<span class="ucount" style="color:' + col(SEVMETA[s].v) + '">' + SEVMETA[s].icon + u[s] + "</span>";
      }).join(" ");
      return '<tr class="urow" data-u="' + esc(u.user) + '"><td><strong>' + esc(u.user) + "</strong></td><td>" + chips +
        '</td><td class="mini muted">' + esc(u.analyzers.join(", ")) + "</td></tr>";
    }).join("") || '<tr><td colspan="3" class="muted mini">No findings tied to a specific account.</td></tr>';
    tb.querySelectorAll(".urow").forEach(function (r) {
      r.addEventListener("click", function () {
        const u = r.getAttribute("data-u");
        userFilter = userFilter === u ? "" : u;
        tb.querySelectorAll(".urow").forEach(function (x) { x.classList.toggle("sel", x.getAttribute("data-u") === userFilter); });
        render();
      });
    });
  }

  function render() {
    const anySev = SEV.some(function (s) { return activeSev[s]; });
    const cat = $("betaCatsel").value;
    const q = $("betaFq").value.toLowerCase();
    const tb = $("betaFrows"); tb.innerHTML = "";
    let shown = 0;
    findings.forEach(function (f) {
      if (anySev && !activeSev[f.Severity]) return;
      if (cat && f.Analyzer !== cat) return;
      if (userFilter && f.User !== userFilter) return;
      if (q && (f.Title + " " + f.Detail + " " + f.Analyzer + " " + f.User).toLowerCase().indexOf(q) === -1) return;
      shown++;
      const m = SEVMETA[f.Severity];
      const tr = document.createElement("tr"); tr.className = "frow";
      tr.innerHTML = '<td><span class="sev"><span class="dot" style="background:' + col(m.v) + '"></span>' + f.Severity + "</span></td>" +
        "<td><strong>" + esc(f.Title) + '</strong><div class="muted mini">' + esc(f.Analyzer) + (f.Mitre ? " · " + esc(f.Mitre) : "") + (f.User ? " · " + esc(f.User) : "") + "</div></td>" +
        '<td class="num mini">' + esc(f.Timestamp) + "</td>";
      const dr = document.createElement("tr"); dr.className = "detail-row"; dr.style.display = "none";
      dr.innerHTML = '<td colspan="3">' + esc(f.Detail).replace(/\n/g, "<br>") +
        (f.User ? '<div class="rec"><strong>Account:</strong> ' + esc(f.User) + "</div>" : "") +
        '<div class="src muted">Analyzer: ' + esc(f.Analyzer) + (f.Mitre ? " · MITRE " + esc(f.Mitre) : "") + "</div></td>";
      tr.addEventListener("click", function () { dr.style.display = dr.style.display === "none" ? "" : "none"; });
      tb.appendChild(tr); tb.appendChild(dr);
    });
    $("betaFempty").style.display = shown ? "none" : "";
    $("betaFilterNote").textContent = userFilter ? "Filtered to " + userFilter + " — click the row again to clear." : "";
  }

  function download(name, mime, content) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function stamp() { return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ""); }
  function exportCsv() {
    const cols = ["Severity", "Analyzer", "Title", "Detail", "User", "Timestamp", "Mitre"];
    const lines = [cols.join(",")];
    findings.forEach(function (f) { lines.push(cols.map(function (c) { return '"' + String(f[c] == null ? "" : f[c]).replace(/"/g, '""') + '"'; }).join(",")); });
    download("MAS-web-" + stamp() + ".csv", "text/csv;charset=utf-8", "﻿" + lines.join("\r\n"));
  }
  function exportJson() {
    download("MAS-web-evidence-" + stamp() + ".json", "application/json",
      JSON.stringify({ generated: new Date().toISOString(), scope: "tenant", findings: findings, users: result.users, stats: result.stats }, null, 1));
  }

  function bind() {
    $("betaCatsel").addEventListener("change", render);
    $("betaFq").addEventListener("input", render);
    $("betaDlCsv").addEventListener("click", exportCsv);
    $("betaDlJson").addEventListener("click", exportJson);
    $("betaPrint").addEventListener("click", function () { window.print(); });
  }

  window.BETA_Report = { show: show, bind: bind };
})();
