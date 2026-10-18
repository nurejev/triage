// Builds review/2026-09-17/workflow-redesign-beta33.html: the workflow proposal of 16 Sep,
// recreated on the BETA layout with the screens as built (BETA 33). The frames are the real
// rendered markup of the beta (capture-frames.mjs, run first) inside the real stylesheet, scoped.
// Usage: node tools/workflow-page/capture-frames.mjs && node tools/workflow-page/make-workflow-page.mjs
import fs from "node:fs";
import path from "node:path";
import { scopeCss } from "./scope-css.mjs";
const root = path.resolve(import.meta.dirname, "..", "..");
const framesDir = path.join(root, "test-results", "workflow-frames");
const outFile = path.join(
  root,
  "review",
  "2026-09-17",
  "workflow-redesign-beta33.html",
);
const logo = (name) =>
  "data:image/svg+xml;base64," +
  fs.readFileSync(path.join(root, "assets", name)).toString("base64");
const IDS = [
  "execution-status",
  "notification",
  "detail-content",
  "dialog-notification",
  "screen-contain",
  "confirmModal",
  "navigation",
  "hour-events",
  "containHead",
  "hour-response-slot",
];
let css = scopeCss(
  fs.readFileSync(path.join(root, "BETA", "css", "desk.css"), "utf8"),
);
for (const id of IDS) css = css.replaceAll("#" + id, `[data-id="${id}"]`);
function frame(name, opts = {}) {
  let html = fs.readFileSync(path.join(framesDir, name + ".html"), "utf8");
  html = html
    .replaceAll(
      'src="../assets/logo-mark-light.svg"',
      `src="${logo("logo-mark-light.svg")}"`,
    )
    .replaceAll(
      'src="../assets/logo-mark-dark.svg"',
      `src="${logo("logo-mark-dark.svg")}"`,
    )
    .replace(/\sid="([^"]*)"/g, ' data-id="$1"')
    .replace(
      /\s(aria-labelledby|for|aria-controls|aria-describedby)="[^"]*"/g,
      "",
    )
    .replace(
      /<select data-id="theme"[\s\S]*?<\/select>/,
      '<span class="theme-static">System</span>',
    );
  const cls = ["app", opts.phone ? "phone" : "", opts.crop ? "crop" : ""]
    .filter(Boolean)
    .join(" ");
  const style = opts.crop ? ` style="--crop:${opts.crop}px"` : "";
  return `<div class="${cls}" data-frame="${name}" aria-label="${opts.label || name}"${style}><div class="app-inner">${html}</div>${opts.crop ? '<div class="crop-fade"><span>the screen continues · cropped here</span></div>' : ""}</div>`;
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const screen = (id, eyebrow, title, text, frameHtml, callouts = []) => `
<section class="screen" id="${id}">
  <div class="screen-head">
    <div><div class="eyebrow">${eyebrow}</div><h3>${title}</h3><p>${text}</p></div>
    ${callouts.length ? `<ol class="callouts">${callouts.map((c) => `<li><b>${c[0]}</b><span>${c[1]}</span></li>`).join("")}</ol>` : ""}
  </div>
  ${frameHtml}
</section>`;

const docCss = `
:root { --bg:#f2f7f3; --surface:#fff; --ink:#12331f; --muted:#5f7a67; --border:#dbe7de; --soft:#eaf3ec; --green:#1e4729; --green-ink:#fff; --lemon:#f7d65a; --red:#b63a39; --red-bg:#fff0ed; --blue:#23638d; --blue-bg:#edf5fc; --amber:#846211; --amber-bg:#fff8dd; --code-bg:#e8f0ea; --shadow: 0 1px 2px rgba(18,51,31,.06), 0 10px 30px rgba(18,51,31,.08); }
:root[data-theme="dark"] { --bg:#0f1512; --surface:#161d19; --ink:#e6f0e8; --muted:#9bb3a3; --border:#2c3e32; --soft:#1c2b21; --green:#b2dbb6; --green-ink:#0f1512; --red:#ffa19c; --red-bg:#3d2020; --blue:#8fc6e7; --blue-bg:#1a2e3b; --amber:#f7d65a; --amber-bg:#362e16; --code-bg:#1c2b21; --shadow:none; }
* { box-sizing: border-box; }
html { background: var(--bg); }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.55; font-synthesis: none; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 24px 20px 72px; }
h1, h2, h3 { line-height: 1.2; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(26px, 4vw, 38px); font-weight: 700; letter-spacing: -.02em; margin-top: 8px; }
h2 { font-size: 22px; font-weight: 700; letter-spacing: -.01em; margin-top: 60px; }
h3 { font-size: 17px; font-weight: 650; }
p { margin: 10px 0 0; max-width: 76ch; }
.lede { font-size: 17px; color: var(--muted); max-width: 72ch; }
.eyebrow { font-size: 11px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
a { color: var(--blue); }
.topline { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.theme-toggle { border: 1px solid var(--border); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12px; cursor: pointer; }
.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 18px; font-size: 13px; }
.toc a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--border); padding-bottom: 1px; }
.toc a:hover { border-color: var(--green); }
.note-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
.note-grid div { font-size: 13px; color: var(--muted); background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
.note-grid b { color: var(--ink); display: block; font-weight: 600; margin-bottom: 2px; }
figure { margin: 18px 0 0; }
figure svg { max-width: 100%; height: auto; display: block; color: var(--ink); }
.scroll { overflow-x: auto; }
figcaption { font-size: 13px; color: var(--muted); margin-top: 8px; max-width: 86ch; }
/* ---------- a screen of the beta, framed ---------- */
.screen { margin-top: 34px; }
.screen-head { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px 28px; align-items: end; margin-bottom: 12px; }
.screen-head p { font-size: 14px; color: var(--muted); margin-top: 6px; }
.callouts { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 12.5px; counter-reset: c; }
.callouts li { counter-increment: c; display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: start; }
.callouts li::before { content: counter(c); grid-row: 1 / span 2; width: 18px; height: 18px; border-radius: 50%; background: var(--lemon); color: #12331f; font-weight: 700; font-size: 11px; display: grid; place-items: center; margin-top: 1px; }
.callouts b { font-weight: 600; grid-column: 2; }
.callouts span { grid-column: 2; margin-top: -4px; }
.callouts span { color: var(--muted); }
.app { container: app / inline-size; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; box-shadow: var(--shadow); zoom: .82; position: relative; }
.app .app-inner { pointer-events: none; user-select: text; }
.app .shell { min-height: 0; }
.app .sidebar { position: static; height: auto; }
.app main { min-height: 0; }
.app.crop .app-inner { max-height: var(--crop, 1200px); overflow: hidden; }
.crop-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 90px; background: linear-gradient(to bottom, transparent, var(--bg) 78%); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 10px; }
.crop-fade span { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; }
.two { display: grid; grid-template-columns: 390px minmax(0, 1fr); gap: 22px; align-items: start; }
.app.phone { zoom: 1; width: 390px; }
.theme-static { display: inline-block; border: 1px solid var(--border); border-radius: 5px; padding: 7px 9px; font-size: 11px; min-height: 36px; }
/* ---------- rules, tables, status ---------- */
ol.rules { padding-left: 0; list-style: none; counter-reset: r; margin: 18px 0 0; display: grid; gap: 10px; }
ol.rules li { counter-increment: r; display: grid; grid-template-columns: 34px 1fr; gap: 10px; align-items: start; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
ol.rules li::before { content: counter(r); font-weight: 700; font-size: 18px; color: var(--green); line-height: 1.1; font-variant-numeric: tabular-nums; }
ol.rules b { display: block; font-weight: 600; }
ol.rules span { color: var(--muted); font-size: 14px; }
table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-top: 1px solid var(--border); }
th { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); border-top: 0; background: var(--soft); }
td:first-child { color: var(--muted); }
.table-scroll { overflow-x: auto; margin-top: 16px; }
.table-scroll table { margin-top: 0; min-width: 640px; }
td b { font-weight: 600; }
.pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.pill.built { background: var(--soft); color: var(--green); }
.pill.partial { background: var(--amber-bg); color: var(--amber); }
.pill.open { background: var(--red-bg); color: var(--red); }
.legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: 8px; }
.legend i { display: inline-block; width: 22px; height: 0; border-top: 2px solid currentColor; vertical-align: middle; margin-right: 6px; }
.legend i.dash { border-top-style: dashed; }
.legend i.blue { border-color: var(--blue); }
.legend i.red { border-color: var(--red); border-top-style: dashed; }
@media (max-width: 900px) { .note-grid { grid-template-columns: 1fr; } .screen-head { grid-template-columns: 1fr; } .two { grid-template-columns: 1fr; } .app { zoom: .6; } .app.phone { zoom: 1; } }
@media (max-width: 480px) { .app.phone { width: 100%; } }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
`;

const corridor = `
<figure>
<div class="scroll">
<svg viewBox="0 0 1140 360" role="img" aria-label="The seven steps as a corridor: Start, Connect, Scope, Collect, Review, Respond, Hand over, each with its URL and the gate that opens it; Review, Respond and Hand over are locked while a collection runs; a reload lands on the same screen of the same case." style="min-width:820px">
  <defs><marker id="c-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="16" y="22" font-size="10" letter-spacing="1.5" font-weight="600" fill="currentColor" opacity=".7">THE RAIL · ONE CORRIDOR, SEVEN DOORS · EVERY DOOR HAS A GATE AND A URL</text>
  <g style="fill:var(--surface);stroke:currentColor;stroke-width:1.2">
    <rect x="16" y="44" width="140" height="66" rx="6"/><rect x="180" y="44" width="140" height="66" rx="6"/><rect x="344" y="44" width="140" height="66" rx="6"/><rect x="508" y="44" width="140" height="66" rx="6"/>
  </g>
  <g style="fill:var(--green);stroke:var(--green);stroke-width:1.2">
    <rect x="672" y="44" width="140" height="66" rx="6"/>
  </g>
  <g style="fill:var(--surface);stroke:currentColor;stroke-width:1.2;stroke-dasharray:4 3">
    <rect x="836" y="44" width="140" height="66" rx="6"/><rect x="1000" y="44" width="124" height="66" rx="6"/>
  </g>
  <g font-size="12" font-weight="650" fill="currentColor">
    <text x="30" y="66">1 · Start</text><text x="194" y="66">2 · Connect</text><text x="358" y="66">3 · Scope</text><text x="522" y="66">4 · Collect</text><text x="850" y="66">6 · Respond</text><text x="1014" y="66">7 · Hand over</text>
  </g>
  <text x="686" y="66" font-size="12" font-weight="650" style="fill:var(--surface)">5 · Review</text>
  <g font-size="10" fill="currentColor" opacity=".75" font-family="ui-monospace, Menlo, monospace">
    <text x="30" y="84">#/start</text><text x="194" y="84">#/connect</text><text x="358" y="84">#/scope</text><text x="522" y="84">#/collect</text><text x="850" y="84">…/respond/&lt;phase&gt;</text><text x="1014" y="84">…/handover</text>
  </g>
  <text x="686" y="84" font-size="10" style="fill:var(--surface)" opacity=".9" font-family="ui-monospace, Menlo, monospace">#/case/&lt;id&gt;/review/…</text>
  <g font-size="9.5" fill="currentColor" opacity=".7">
    <text x="30" y="100">New · Open · Sample</text><text x="194" y="100">tenant pinned · sign in</text><text x="358" y="100">who · window · preset</text><text x="522" y="100">progress · Stop</text><text x="850" y="100">5 phases · runbook</text><text x="1014" y="100">exports · next case</text>
  </g>
  <text x="686" y="100" font-size="9.5" style="fill:var(--surface)" opacity=".9">4 tabs · drawer</text>
  <!-- arrows between steps -->
  <g stroke="currentColor" stroke-width="1.4" marker-end="url(#c-ar)">
    <line x1="156" y1="77" x2="178" y2="77"/><line x1="320" y1="77" x2="342" y2="77"/><line x1="484" y1="77" x2="506" y2="77"/><line x1="648" y1="77" x2="670" y2="77"/><line x1="812" y1="77" x2="834" y2="77"/><line x1="976" y1="77" x2="998" y2="77"/>
  </g>
  <!-- gates -->
  <g font-size="10" fill="currentColor">
    <text x="86" y="140" text-anchor="middle" font-weight="600">always open</text>
    <text x="250" y="140" text-anchor="middle" font-weight="600">not in the viewer</text>
    <text x="414" y="140" text-anchor="middle" font-weight="600">signed in (or sample)</text>
    <text x="578" y="140" text-anchor="middle" font-weight="600">a case exists</text>
    <text x="742" y="140" text-anchor="middle" font-weight="600">after collection</text>
    <text x="906" y="140" text-anchor="middle" font-weight="600">after collection</text>
    <text x="1062" y="140" text-anchor="middle" font-weight="600">after collection</text>
  </g>
  <g font-size="9" fill="currentColor" opacity=".7">
    <text x="86" y="154" text-anchor="middle">gate</text><text x="250" y="154" text-anchor="middle">gate · "This viewer only reads a case"</text><text x="414" y="154" text-anchor="middle">gate · "Sign in first"</text><text x="578" y="154" text-anchor="middle">gate · "Choose the scope first"</text><text x="742" y="154" text-anchor="middle">gate · "After collection"</text><text x="906" y="154" text-anchor="middle">gate · "After collection"</text><text x="1062" y="154" text-anchor="middle">gate · "After collection"</text>
  </g>
  <g stroke="currentColor" stroke-width="1" opacity=".35"><line x1="86" y1="110" x2="86" y2="128"/><line x1="250" y1="110" x2="250" y2="128"/><line x1="414" y1="110" x2="414" y2="128"/><line x1="578" y1="110" x2="578" y2="128"/><line x1="742" y1="110" x2="742" y2="128"/><line x1="906" y1="110" x2="906" y2="128"/><line x1="1062" y1="110" x2="1062" y2="128"/></g>
  <!-- collection lock -->
  <rect x="508" y="182" width="616" height="44" rx="6" style="fill:var(--amber-bg);stroke:var(--amber);stroke-width:1.2"/>
  <text x="816" y="200" font-size="11" font-weight="650" text-anchor="middle" style="fill:var(--amber)">While a collection runs: Review, Respond and Hand over are locked ("Collection is running")</text>
  <text x="816" y="216" font-size="10" text-anchor="middle" style="fill:var(--amber)">the rail shows Collecting evidence · n / m sources with Stop collecting; Review opens by itself when the last source ends</text>
  <!-- back / reload / drawer -->
  <g style="fill:var(--soft);stroke:currentColor;stroke-width:1">
    <rect x="16" y="252" width="356" height="88" rx="6"/><rect x="392" y="252" width="356" height="88" rx="6"/><rect x="768" y="252" width="356" height="88" rx="6"/>
  </g>
  <g font-size="11.5" font-weight="650" fill="currentColor"><text x="30" y="274">Back always returns to the previous screen</text><text x="406" y="274">Reload lands on the same screen of the same case</text><text x="782" y="274">Details open beside the list, never elsewhere</text></g>
  <g font-size="10" fill="currentColor" opacity=".8">
    <text x="30" y="292">Every step and every drawer is a history entry:</text><text x="30" y="306">#/case/…/review/findings?f=EntraAuditLogs-79114c9c</text><text x="30" y="324">Escape or Close pops the drawer; Back does the same.</text>
    <text x="406" y="292">The case saves itself 1.5 s after a change (IndexedDB on the</text><text x="406" y="306">web, the evidence folder in the app); the route is remembered</text><text x="406" y="324">per session. Leaving warns only while collecting or unsaved.</text>
    <text x="782" y="292">A finding (?f=), a record (?r=) or a source (?s=) opens in a</text><text x="782" y="306">drawer to the right of the list — the list keeps its scroll,</text><text x="782" y="324">filter and severity; the rail keeps its tabs.</text>
  </g>
</svg>
</div>
<figcaption>As built in <code>desk.js</code>: <code>gateFor()</code> decides which steps open and names the reason on the greyed-out step; <code>navigate()</code> writes the hash; <code>rememberRoute()</code> plus autosave make a reload land where you were. The sample case skips Connect: it is the only way into Scope without a sign-in.</figcaption>
</figure>`;

const signin = `
<figure>
<div class="scroll">
<svg viewBox="0 0 1140 470" role="img" aria-label="Two swim-lane timelines as built. Web: on Connect the tenant is looked up, then one Microsoft window signs in; Scope and Collect open no window; on Respond the account checks reuse the sign-in silently; only Arm containment opens a consent window. Desktop app: on Connect each service is a row — Microsoft Graph, then optionally Exchange Online — each opening one browser window announced on its row and kept as a PowerShell session; Collect releases the sessions without a window; Respond's account checks open one announced window (work package 41 still open); Arm opens consent." style="min-width:820px">
  <defs><marker id="s-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <!-- WEB -->
  <text x="16" y="22" font-size="10" letter-spacing="1.5" font-weight="600" fill="currentColor" opacity=".7">WEB · BETA 33 · ONE CASE</text>
  <g stroke="currentColor" stroke-width="1" opacity=".25"><line x1="120" y1="66" x2="1124" y2="66"/><line x1="120" y1="122" x2="1124" y2="122"/><line x1="120" y1="178" x2="1124" y2="178"/></g>
  <g font-size="11" font-weight="600" fill="currentColor"><text x="16" y="70">You</text><text x="16" y="126">Triage</text><text x="16" y="182">Browser</text><text x="16" y="195" font-size="9" font-weight="400" opacity=".7">Microsoft sign-in</text></g>
  <g font-size="9.5" fill="currentColor" opacity=".7" text-anchor="middle"><text x="230" y="44">2 · CONNECT</text><text x="470" y="44">3 · SCOPE → 4 · COLLECT</text><text x="760" y="44">6 · RESPOND</text><text x="1010" y="44">ARM (WRITE)</text></g>
  <g stroke="currentColor" stroke-width="1" opacity=".18" stroke-dasharray="3 3"><line x1="348" y1="34" x2="348" y2="200"/><line x1="600" y1="34" x2="600" y2="200"/><line x1="920" y1="34" x2="920" y2="200"/></g>
  <g style="fill:var(--surface);stroke:currentColor;stroke-width:1.2">
    <rect x="128" y="52" width="104" height="28" rx="4"/><rect x="242" y="52" width="96" height="28" rx="4"/><rect x="360" y="52" width="220" height="28" rx="4"/><rect x="620" y="52" width="130" height="28" rx="4"/><rect x="940" y="52" width="150" height="28" rx="4"/>
  </g>
  <g font-size="10.5" fill="currentColor" text-anchor="middle"><text x="180" y="70">Look up tenant</text><text x="290" y="70">Sign in</text><text x="470" y="70">Start collection · no window</text><text x="685" y="70">open a phase</text><text x="1015" y="70">Arm containment</text></g>
  <g style="fill:var(--surface);stroke:currentColor;stroke-width:1.2">
    <rect x="128" y="108" width="104" height="28" rx="4"/><rect x="242" y="108" width="96" height="28" rx="4"/><rect x="360" y="108" width="220" height="28" rx="4"/><rect x="620" y="108" width="280" height="28" rx="4"/><rect x="940" y="108" width="150" height="28" rx="4"/>
  </g>
  <g font-size="9.5" fill="currentColor" text-anchor="middle"><text x="180" y="126">OpenID → tenant ID</text><text x="290" y="126">MSAL, pinned</text><text x="470" y="126">Graph pages with the same token</text><text x="760" y="126">Account checks: connected silently, row says Connected</text><text x="1015" y="126">requests write scopes</text></g>
  <g style="fill:var(--blue-bg);stroke:var(--blue);stroke-width:1.4"><rect x="242" y="164" width="96" height="28" rx="4"/><rect x="940" y="164" width="150" height="28" rx="4"/></g>
  <g font-size="10" font-weight="600" style="fill:var(--blue)" text-anchor="middle"><text x="290" y="182">1 · sign-in window</text><text x="1015" y="182">2 · consent window</text></g>
  <g stroke="currentColor" stroke-width="1.2" marker-end="url(#s-ar)"><line x1="180" y1="80" x2="180" y2="106"/><line x1="290" y1="80" x2="290" y2="106"/><line x1="470" y1="80" x2="470" y2="106"/><line x1="685" y1="80" x2="685" y2="106"/><line x1="1015" y1="80" x2="1015" y2="106"/><line x1="280" y1="136" x2="280" y2="162"/><line x1="1005" y1="136" x2="1005" y2="162"/></g>
  <g stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3" marker-end="url(#s-ar)"><line x1="300" y1="164" x2="300" y2="138"/><line x1="1025" y1="164" x2="1025" y2="138"/></g>
  <text x="130" y="214" font-size="10.5" font-weight="600" style="fill:var(--green)">Two windows per case, both on the step that asks for them. Scope, Collect and Respond never open one.</text>
  <!-- APP -->
  <line x1="16" y1="236" x2="1124" y2="236" stroke="currentColor" stroke-width="1" opacity=".3"/>
  <text x="16" y="258" font-size="10" letter-spacing="1.5" font-weight="600" fill="currentColor" opacity=".7">DESKTOP APP 0.33 · ONE CASE · POWERSHELL SESSIONS KEPT FROM CONNECT TO COLLECT</text>
  <g stroke="currentColor" stroke-width="1" opacity=".25"><line x1="120" y1="302" x2="1124" y2="302"/><line x1="120" y1="358" x2="1124" y2="358"/><line x1="120" y1="414" x2="1124" y2="414"/></g>
  <g font-size="11" font-weight="600" fill="currentColor"><text x="16" y="306">You</text><text x="16" y="362">Triage app</text><text x="16" y="418">Browser</text><text x="16" y="431" font-size="9" font-weight="400" opacity=".7">Microsoft sign-in</text></g>
  <g stroke="currentColor" stroke-width="1" opacity=".18" stroke-dasharray="3 3"><line x1="472" y1="270" x2="472" y2="440"/><line x1="700" y1="270" x2="700" y2="440"/><line x1="920" y1="270" x2="920" y2="440"/></g>
  <g font-size="9.5" fill="currentColor" opacity=".7" text-anchor="middle"><text x="290" y="280">2 · CONNECT · ROWS</text><text x="580" y="280">3 · SCOPE → 4 · COLLECT</text><text x="810" y="280">6 · RESPOND</text><text x="1020" y="280">ARM (WRITE)</text></g>
  <g style="fill:var(--surface);stroke:currentColor;stroke-width:1.2">
    <rect x="128" y="288" width="104" height="28" rx="4"/><rect x="242" y="288" width="104" height="28" rx="4"/><rect x="356" y="288" width="104" height="28" rx="4"/><rect x="486" y="288" width="200" height="28" rx="4"/><rect x="720" y="288" width="180" height="28" rx="4"/><rect x="940" y="288" width="150" height="28" rx="4"/>
  </g>
  <g font-size="10.5" fill="currentColor" text-anchor="middle"><text x="180" y="306">Tenant · domain</text><text x="294" y="306">Graph · Sign in</text><text x="408" y="306">Exchange · Sign in</text><text x="586" y="306">Start collection · no window</text><text x="810" y="306">Open account checks</text><text x="1015" y="306">Arm containment</text></g>
  <g style="fill:var(--surface);stroke:currentColor;stroke-width:1.2">
    <rect x="128" y="344" width="104" height="28" rx="4"/><rect x="242" y="344" width="104" height="28" rx="4"/><rect x="356" y="344" width="104" height="28" rx="4"/><rect x="486" y="344" width="200" height="28" rx="4"/><rect x="720" y="344" width="180" height="28" rx="4"/><rect x="940" y="344" width="150" height="28" rx="4"/>
  </g>
  <g font-size="9.5" fill="currentColor" text-anchor="middle"><text x="180" y="362">pinned before window</text><text x="294" y="362">row: Waiting · 0:42</text><text x="408" y="362">row: Waiting · optional</text><text x="586" y="362">releases the sessions · plan.json</text><text x="810" y="362">row says one window will open</text><text x="1015" y="362">consent for write scopes</text></g>
  <g style="fill:var(--blue-bg);stroke:var(--blue);stroke-width:1.4"><rect x="242" y="400" width="104" height="28" rx="4"/><rect x="356" y="400" width="104" height="28" rx="4"/><rect x="720" y="400" width="180" height="28" rx="4"/><rect x="940" y="400" width="150" height="28" rx="4"/></g>
  <g font-size="10" font-weight="600" style="fill:var(--blue)" text-anchor="middle"><text x="294" y="418">1 · Graph</text><text x="408" y="418">2 · Exchange</text><text x="810" y="418">3 · Graph (checks) · WP-41</text><text x="1015" y="418">4 · consent</text></g>
  <g stroke="currentColor" stroke-width="1.2" marker-end="url(#s-ar)"><line x1="180" y1="316" x2="180" y2="342"/><line x1="294" y1="316" x2="294" y2="342"/><line x1="408" y1="316" x2="408" y2="342"/><line x1="586" y1="316" x2="586" y2="342"/><line x1="810" y1="316" x2="810" y2="342"/><line x1="1015" y1="316" x2="1015" y2="342"/><line x1="284" y1="372" x2="284" y2="398"/><line x1="398" y1="372" x2="398" y2="398"/><line x1="800" y1="372" x2="800" y2="398"/><line x1="1005" y1="372" x2="1005" y2="398"/></g>
  <g stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3" marker-end="url(#s-ar)"><line x1="304" y1="400" x2="304" y2="374"/><line x1="418" y1="400" x2="418" y2="374"/><line x1="820" y1="400" x2="820" y2="374"/><line x1="1025" y1="400" x2="1025" y2="374"/></g>
  <text x="130" y="452" font-size="10.5" font-weight="600" style="fill:var(--green)">Every window is announced by the row that opens it, with a waiting state and elapsed time. Collect opens none. The Respond window goes away with the msal-node hand-off (WP-41, open).</text>
</svg>
</div>
<div class="legend"><span><i></i>opens</span><span><i class="dash"></i>callback</span><span><i class="blue"></i>Microsoft window</span></div>
<figcaption>As built: <code>graph.js</code> pins the tenant (<code>resolveTenant</code> → request-level authority) before <code>signIn()</code>; <code>main.cjs</code> keeps one <code>collect.ps1 -WaitForCollection</code> session per service (idle limit 30 min, connect timeout 10 min) until <code>collect(plan)</code> releases them with the plan; <code>desk.js</code> connects the Respond checks on the web with the existing account (<code>responseAutoConnects()</code>).</figcaption>
</figure>`;

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Triage workflow · as built in BETA 33</title>
<meta name="description" content="Limon-IT Triage: the seven-step workflow (Start, Connect, Scope, Collect, Review, Respond, Hand over) recreated on the BETA layout with the screens as built in BETA 33.">
<style>${docCss}</style>
<style>${css}</style>
<script>
(function(){var k="triage-workflow-theme",m=matchMedia("(prefers-color-scheme: dark)");function apply(){var t=null;try{t=localStorage.getItem(k)}catch(e){}document.documentElement.dataset.theme=t||(m.matches?"dark":"light")}apply();m.addEventListener("change",apply);addEventListener("DOMContentLoaded",function(){var b=document.querySelector(".theme-toggle");if(!b)return;b.addEventListener("click",function(){var next=document.documentElement.dataset.theme==="dark"?"light":"dark";try{localStorage.setItem(k,next)}catch(e){}document.documentElement.dataset.theme=next})})})();
</script>
</head>
<body>
<div class="wrap">
  <div class="topline"><div class="eyebrow">Limon-IT Triage · BETA 33 · the workflow as built · 17 Sep 2026</div><button type="button" class="theme-toggle">Light / dark</button></div>
  <h1>One procedure, seven steps, always visible.</h1>
  <p class="lede">The proposal of 16 September asked for a corridor instead of nine doors. BETA 31–33 built it into the beta's own shell: the sidebar became the step rail, every screen got one primary action and a URL, sign-in moved to one step, and — since build 33 — Collect states in one line whose evidence it is collecting. This page is the proposal redrawn on that layout. Every frame below is the real rendered screen of build 33 with synthetic data, not a wireframe.</p>
  <nav class="toc" aria-label="Contents"><a href="#shell">The shell</a><a href="#corridor">1 · The corridor</a><a href="#signin">2 · Sign-in</a><a href="#screens">3 · One screen per step</a><a href="#rules">4 · The navigation contract</a><a href="#names">5 · One name per thing</a><a href="#status">6 · Built · partial · open</a></nav>

  <h2 id="shell" style="margin-top:44px">The shell every screen gets</h2>
  <p>Rail on the left with the seven steps and one status line each; breadcrumb, theme, session chip and Sign in / Disconnect in the top bar; the case bar with the case, its record count and the save state; the execution strip that says which engine is running and where. Here: the sample case on step 5, a finding open in the drawer.</p>
  ${frame("05-review-findings-drawer", { label: "Review · findings with the drawer", crop: 1500 })}
  <div class="note-grid">
    <div><b>Where am I</b>The rail highlights the current step, ticks the finished ones and greys out the ones that are not open yet — with the reason on hover. The breadcrumb repeats it: <em>Step 5 of 7 / Review</em>.</div>
    <div><b>What do I do now</b>One primary button per screen: New investigation → Choose the scope → Start collection → Open Review → the drawer's Save review → Next phase → Hand over. Back is the browser's.</div>
    <div><b>Will I lose this</b>The case bar says <em>saving… / saved 11:54</em>. Reload restores the screen of the open case; a second collection asks before replacing anything; the previous case stays under Open a case.</div>
  </div>

  <h2 id="corridor">1 · The corridor: seven doors, one order</h2>
  <p>Instead of nine always-visible destinations, the rail lists the seven steps in the order the work happens. Each has a gate (what must be true before it opens), a URL (so Back and reload work) and a status line (what happened there). A running collection locks everything after Collect.</p>
  ${corridor}

  <h2 id="signin">2 · Sign-in: rows on Connect, reused on Respond</h2>
  <p>The proposal's complaint was four browser windows announced only by a status line. As built, every window belongs to a row that says it will open, shows a waiting state with elapsed time, and shows the result. On the web that is one window per case (plus consent when you arm containment); in the desktop app one per service, kept as a PowerShell session until Collect releases it.</p>
  ${signin}

  <h2 id="screens">3 · One screen per step</h2>
  <p>The real screens of build 33. Web frames run in a browser with the Connect sign-in; app frames show the desktop app with its service rows and PowerShell collector. Callouts name what the proposal asked for and where it landed.</p>

  ${screen(
    "s1",
    "Step 1 of 7 · web and app",
    "Start: three ways in, nothing else",
    "One primary path (New investigation), the two others beside it. With a case open the same screen offers Continue last case (app) or the previous case under Open a case. Nothing on this screen signs in.",
    frame("01-start", { label: "Start" }),
    [
      [
        "Three doors, one primary",
        "New investigation is the primary path; Open a case and Try the sample sit beside it.",
      ],
      [
        "The rail already tells the story",
        "Steps 3–7 are greyed out with their reason; Connect says Sign in once.",
      ],
      [
        "Downloads live here",
        "The desktop app for mailbox evidence, with the macOS first-launch note.",
      ],
    ],
  )}

  ${screen(
    "s2",
    "Step 2 of 7 · web",
    "Connect: pin the tenant, then one window",
    "My organisation or a customer tenant by domain. Look up tenant resolves the domain to its tenant ID from Microsoft's public sign-in configuration, so the Microsoft window opens for that tenant — a partner account gets a token for the customer, not for its home tenant. Sign in is the only button that opens a window.",
    frame("02-connect-web", { label: "Connect on the web" }),
    [
      [
        "Tenant before window",
        "The green notice shows domain · tenant ID; Sign in stays closed until it is pinned.",
      ],
      [
        "One sign-in per case",
        "The chip top-right becomes account · domain · Graph ✓ and the rail's Connect line shows the account.",
      ],
      [
        "What is read",
        "Delegated, read-only Graph scopes at sign-in; mail is opt-in on the app.",
      ],
    ],
  )}

  ${screen(
    "s2b",
    "Step 2 of 7 · desktop app",
    "Connect: each service is a row",
    "Microsoft Graph (required) and Exchange Online (optional) sign in as rows: Sign in, then Waiting for you with the elapsed time and a Cancel, then Ready with the account. The PowerShell session stays open until Collect releases it or 30 idle minutes pass. Readiness (PowerShell, modules) is checked on this step, before anything opens.",
    frame("09-connect-app", {
      label: "Connect in the desktop app, Exchange waiting",
    }),
    [
      [
        "Announced, not silent",
        "The row says the window opened and counts the seconds; nothing else on the screen changes.",
      ],
      [
        "Optional stays optional",
        "Exchange can be skipped; Standard/Everything presets need it and say so on Scope.",
      ],
      [
        "Customer certificates",
        "A saved profile signs in without a browser; the row says so.",
      ],
    ],
  )}

  ${screen(
    "s3",
    "Step 3 of 7 · web",
    "Scope: who, how far back, how much",
    "One affected account (suggested from the tenant as you type) or the whole tenant; a window of 7, 30 or 90 days; a preset — Quick (7 Graph sources), Standard (all 12 Graph sources on the web), Everything or Custom. Start collection is the single exit. Save collection plan hands the same scope to the desktop app for mailbox evidence.",
    frame("03-scope-web", { label: "Scope on the web", crop: 1350 }),
    [
      [
        "Account confirmed before reading",
        "✓ Jan de Vries — found in contoso.nl; a typo is caught here, not after a 20-minute collection.",
      ],
      [
        "Presets, then the list",
        "Custom opens the source list with Select all / Deselect all; the count follows.",
      ],
      [
        "Method stated",
        "Collection method: Browser JavaScript / PowerShell, with what that means.",
      ],
    ],
  )}

  ${screen(
    "s3b",
    "Step 3 of 7 · desktop app",
    "Scope in the app: tenant-wide with a custom plan",
    "The same form with PowerShell as the method and the evidence folder underneath. Tenant-wide review needs no account; Response later asks for one. Presets that need Exchange are disabled until Exchange is signed in.",
    frame("10-scope-app", { label: "Scope in the desktop app", crop: 1350 }),
    [
      [
        "No new sign-in",
        "The services you signed in to on Connect are reused; no new sign-in.",
      ],
      [
        "Evidence folder",
        "New collections save there automatically; the case bar's Save writes reviews and the action log.",
      ],
    ],
  )}

  ${screen(
    "s4",
    "Step 4 of 7 · web · new in build 33",
    "Collect: whose evidence, in one line",
    "The green banner states the target — the affected account in its tenant, or Whole tenant · domain — with the window, the number of sources, the method and the signed-in analyst. Under it: every selected source with its state and record count; open one to see the records that already arrived. Stop keeps what came back. Review opens by itself when the last source ends.",
    frame("04-collect-web", {
      label: "Collect on the web, one account",
      crop: 1500,
    }),
    [
      [
        "The statement that was a small row",
        "jan.devries@contoso.nl in contoso.nl — 30 days · 12 sources · Microsoft Graph in this browser · signed in as analyst@contoso.nl.",
      ],
      [
        "Progress you can read",
        "8 / 12 complete, 1 collecting, 3 waiting; the running source is first and explicit; the rail repeats it.",
      ],
      [
        "Locked for a reason",
        "Review, Respond and Hand over say Collection is running; the strip says which engine runs where.",
      ],
    ],
  )}

  ${screen(
    "s4b",
    "Step 4 of 7 · desktop app",
    "Collect in the app: whole tenant, PowerShell",
    "Same screen, tenant-wide: Whole tenant · contoso.nl, both service rows in Collecting, Graph ✓ · Exchange ✓ next to the analyst. The connection rows show the sessions being consumed; the Collection details panel carries the PowerShell output.",
    frame("11-collect-app", {
      label: "Collect in the desktop app, whole tenant",
      crop: 1500,
    }),
    [
      [
        "Which tenant, unmistakably",
        "Whole tenant · contoso.nl, with the tenant ID under it.",
      ],
      [
        "Signed in stays visible",
        "While collecting, the chip and the rail keep the account; the Disconnect button is disabled rather than replaced by Sign in.",
      ],
    ],
  )}

  ${screen(
    "s5",
    "Step 5 of 7",
    "Review: the list keeps its place, the detail opens beside it",
    "Overview, Findings, Timeline and Evidence are tabs under Review in the rail. A finding opens in a drawer with its explanation, the records it rests on, and the review form (state, reason, reference). The URL carries the open item (?f=, ?r=, ?s=), so Back closes the drawer and reload reopens it.",
    frame("05b-review-evidence", {
      label: "Review · evidence with a source open",
      crop: 1500,
    }),
    [
      [
        "Evidence per source",
        "Every source: state, count, the query window, errors; records open in a drawer with their facts and raw JSON.",
      ],
      [
        "Gaps stay visible",
        "Not collected, partial and failed sources are distinct and carried into the handover.",
      ],
      [
        "Analysis is JavaScript",
        "The strip says so even when collection was PowerShell.",
      ],
    ],
  )}

  ${screen(
    "s6",
    "Step 6 of 7",
    "Respond: five phases, the runbook inside",
    "The first 60 minutes as five phases (Confirm & preserve, Contain & record, Establish impact, Preserve & export evidence, Communicate & hand over) with the runbook embedded. The account checks reuse the Connect sign-in on the web — the row says Connected on arrival; the app announces one window. Nothing here re-runs triage.",
    frame("06-respond-contain", {
      label: "Respond · Contain & record",
      crop: 1500,
    }),
    [
      [
        "No starting again",
        "Affected account ✓ and Account checks · Connected: the case and its sign-in are reused, not re-asked.",
      ],
      [
        "Write is a separate decision",
        "Containment is not armed until you arm it; the chip says write armed / not armed.",
      ],
      [
        "Every result lands in the log",
        "The case action log on the right records checks, decisions and notes in UTC.",
      ],
    ],
  )}

  ${screen(
    "s7",
    "Step 7 of 7",
    "Hand over: what the next owner gets, what is still open",
    "The handover note, the case file and the action log from one place; the findings by state; the open items. Exporting the note marks the step Handed over in the rail. Start the next case from here.",
    frame("07-handover", { label: "Hand over", crop: 1500 }),
    [
      [
        "Exports in one place",
        "Handover note (.md), case file (.json, integrity-checked), action log (.csv).",
      ],
      [
        "Open work is explicit",
        "Unreviewed findings, gaps and undecided phases are listed, not implied.",
      ],
    ],
  )}

  ${screen(
    "s8",
    "Help · coverage",
    "What's new: every change carries a build number",
    "Since build 32 the Help screen lists What's new per build; the badge in the rail and the footer take the number from build.js. If something changed, the number changed.",
    frame("08-help", { label: "Help · What's new", crop: 2250 }),
    [["Rule", "A change that is not visible as a build number did not ship."]],
  )}

  <section class="screen" id="s9">
    <div class="screen-head"><div><div class="eyebrow">Phone · 390 px</div><h3>The same screens, stacked</h3><p>Below 760 px the rail becomes a strip above the workspace that scrolls sideways, without status lines; panels stack; the Collect banner stacks its four facts. The drawer opens under the list.</p></div>
    <ol class="callouts"><li><b>Real layout, not a sketch</b><span>This frame is the Collect markup above laid out at 390 px by the beta's own stylesheet.</span></li><li><b>Still open</b><span>The rail scrolls sideways rather than folding into a sheet with the step states (see 6).</span></li></ol></div>
    <div class="two">${frame("04-collect-web", { label: "Collect on a phone", phone: true, crop: 1500 })}<div><p style="font-size:14px;color:var(--muted)">What holds on a phone: the target banner, the progress, Stop collecting, every source row. What does not: the seven status lines of the rail (hidden below 760 px; the steps sit in a strip that scrolls sideways) and the two-column drawer (it stacks under the list).</p></div></div>
  </section>

  <h2 id="rules">4 · The navigation contract, as built</h2>
  <p>The rules the proposal asked for, with where each one lives now.</p>
  <ol class="rules">
    <li><b>The rail is the map.</b><span>Seven steps in order, one status line each, ticks for done, grey with a reason for not yet open (<code>renderRail()</code>, <code>stepStatus()</code>, <code>gateFor()</code>).</span></li>
    <li><b>The URL names the step and the case.</b><span><code>#/start</code> … <code>#/case/&lt;id&gt;/review/findings?f=…</code>. Back returns to the previous screen or closes the drawer; reload lands on the same screen of the same case (<code>navigate()</code>, <code>rememberRoute()</code>).</span></li>
    <li><b>One primary action per screen.</b><span>New investigation · Choose the scope · Start collection · Open Review · Save review · Next phase · Hand over. Secondary actions are text buttons or sit in the case bar.</span></li>
    <li><b>Sign-in happens on Connect, nowhere else.</b><span>Web: tenant pinned, one window. App: one row per service, session kept. Scope and Collect never open a window; Respond reuses the sign-in (web) or announces its one window (app).</span></li>
    <li><b>Details open beside the list.</b><span>Findings, records and sources open in a drawer (<code>.drawer-layout</code>) that keeps the list's scroll, filter and severity. No modal, no jump to another page.</span></li>
    <li><b>A running collection locks the rest.</b><span>Review, Respond and Hand over show Collection is running; the rail shows the running collection with Stop; Review opens by itself when it ends (<code>finishCollection()</code>).</span></li>
    <li><b>The case saves itself and says so.</b><span>1.5 s after a change: IndexedDB on the web, the evidence folder in the app. The case bar shows saving… / saved hh:mm; leaving warns only while collecting or unsaved (<code>touch()</code>, <code>autosave()</code>).</span></li>
    <li><b>Collect states whose evidence it is.</b><span>Account or whole tenant, tenant, window, sources, method, signed-in analyst — in a banner, not a small row; it stays after the collection and on reopened cases (<code>collectionTarget()</code>, build 33).</span></li>
    <li><b>A second collection asks first.</b><span>Start a new collection? keeps the open case saved under Open a case; the sample is discarded silently because it is never saved.</span></li>
    <li><b>Every change is visible as a build number.</b><span>BETA badge, footer Build n · Guide, Help → What's new (<code>build.js</code>); the live site has its own build number for shared files.</span></li>
  </ol>

  <h2 id="names">5 · One name per thing</h2>
  <p>The same word in the rail, the breadcrumb, the page eyebrow, the buttons and the guide.</p>
  <div class="table-scroll"><table>
    <thead><tr><th>Thing</th><th>Name</th><th>Not</th></tr></thead>
    <tbody>
      <tr><td>Step 1</td><td><b>Start</b> · New investigation · Open a case · Try the sample</td><td>Home, Landing, Quick check</td></tr>
      <tr><td>Step 2</td><td><b>Connect</b> · Sign in / Disconnect · Look up tenant</td><td>Connect Microsoft 365, Login, Check desktop readiness</td></tr>
      <tr><td>Step 3</td><td><b>Scope</b> · One affected account / Tenant-wide review · Lookback window · Quick / Standard / Everything / Custom · Start collection · Save collection plan</td><td>Setup, Quick form, Run full triage</td></tr>
      <tr><td>Step 4</td><td><b>Collect</b> · Collecting from / Collected from · Stop collecting · Collection coverage · Collection details</td><td>Overview, Progress, Portable collector</td></tr>
      <tr><td>Step 5</td><td><b>Review</b> · Overview · Findings · Timeline · Evidence · the drawer</td><td>Report, Results, Inspect source</td></tr>
      <tr><td>Step 6</td><td><b>Respond</b> · First 60 minutes · five phases · Account checks · Arm containment</td><td>First 60 min, Runbook, Connect account checks, Run triage</td></tr>
      <tr><td>Step 7</td><td><b>Hand over</b> · Handover note · Case file · Action log · Start next case</td><td>Action log page, Export page</td></tr>
      <tr><td>The people</td><td><b>Affected account</b> (who is investigated) · <b>Signed in as</b> / the analyst (who collects) · <b>Tenant</b> (where)</td><td>Subject, Target, User, Operator, Customer</td></tr>
      <tr><td>The files</td><td><b>Case file</b> (.json, integrity-checked) · <b>Collection plan</b> (for the app) · <b>Evidence folder</b> (app)</td><td>Bundle, Export, Plan JSON</td></tr>
    </tbody>
  </table></div>

  <h2 id="status">6 · Built · partial · open</h2>
  <p>Where the proposal's screens and rules stand after BETA 33 / desktop 0.33.0.</p>
  <div class="table-scroll"><table>
    <thead><tr><th>Item</th><th>State</th><th>Where it landed · what is left</th></tr></thead>
    <tbody>
      <tr><td>Step rail with status lines</td><td><span class="pill built">built</span></td><td>Sidebar = rail; gates with reasons; sub-tabs under Review; long names clip (build 32).</td></tr>
      <tr><td>URL per step, Back, reload restore</td><td><span class="pill built">built</span></td><td>Hash router with case id and drawer state; route remembered per session; autosave.</td></tr>
      <tr><td>Connect · tenant pinned, one window (web)</td><td><span class="pill built">built</span></td><td>OpenID lookup → tenant ID → MSAL authority; sign-in landing in another tenant is rejected.</td></tr>
      <tr><td>Connect · service rows with sessions (app)</td><td><span class="pill built">built</span></td><td>connect-first PowerShell (<code>-WaitForCollection</code>), waiting state with elapsed time, Cancel, 10-min connect timeout, 30-min idle.</td></tr>
      <tr><td>Scope · presets and account suggestion</td><td><span class="pill built">built</span></td><td>Quick / Standard / Everything / Custom; suggestions from the tenant on the web; plan file for the app.</td></tr>
      <tr><td>Collect · one screen, Stop, auto-open Review</td><td><span class="pill built">built</span></td><td>Coverage panel, running source first, records openable during collection.</td></tr>
      <tr><td>Collect · prominent account / tenant statement</td><td><span class="pill built">built · 33</span></td><td>Target banner with tenant, window, sources, method, analyst; web cases record the analyst.</td></tr>
      <tr><td>Review · drawer instead of dialogs</td><td><span class="pill built">built</span></td><td>Findings, records and sources in a drawer with URL state.</td></tr>
      <tr><td>Review · supporting evidence list in the drawer</td><td><span class="pill partial">partial</span></td><td>Shown when a finding names its records; most analyzers do not name them yet.</td></tr>
      <tr><td>Respond · reuse the sign-in</td><td><span class="pill built">built · web</span></td><td>Account checks connect silently with the Connect account (build 32); the preserve card that asked to run triage again is gone.</td></tr>
      <tr><td>Respond · no window in the app</td><td><span class="pill open">open · WP-41</span></td><td>The app still opens one announced Microsoft window for the checks; the msal-node hand-off removes it without changing the screen.</td></tr>
      <tr><td>Hand over · exports and open items</td><td><span class="pill built">built</span></td><td>Note, case file, action log; Handed over in the rail.</td></tr>
      <tr><td>Build number visible on every change</td><td><span class="pill built">built · 32</span></td><td>Badge, footer, What's new; live-site build for shared files.</td></tr>
      <tr><td>Phone · rail as a sheet</td><td><span class="pill partial">partial</span></td><td>The rail is a sideways-scrolling strip above the workspace without status lines; no sheet that shows the seven states at once.</td></tr>
      <tr><td>Collect · elapsed time per source</td><td><span class="pill open">open</span></td><td>Sources show state and count; per-source timing is not shown.</td></tr>
      <tr><td>App · tenant by domain</td><td><span class="pill partial">partial</span></td><td>Domain or ID is accepted; the tenant is resolved before the browser opens, the field is one input for both.</td></tr>
    </tbody>
  </table></div>
  <p style="margin-top:28px;font-size:13px;color:var(--muted)">Generated from the BETA 33 build with <code>tools/workflow-page/capture-frames.mjs</code> (rendered markup) and <code>tools/workflow-page/make-workflow-page.mjs</code> (this page). The frames use the beta's own <code>desk.css</code>, scoped; light and dark follow the toggle at the top. Data is synthetic: contoso.nl, jan.devries, analyst@contoso.nl and the fictional sample case.</p>
</div>
</body>
</html>`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(
  "wrote",
  path.relative(root, outFile),
  (fs.statSync(outFile).size / 1024).toFixed(0) + " KB",
);
