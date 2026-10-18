// Scopes the BETA stylesheet under a frame element so real screens can sit inside a document.
// :root → .app, body → .app, [data-theme=dark] → :root[data-theme=dark] .app, every other
// selector gets the .app prefix, and width media queries become container queries so a
// frame lays out by its own width (a 390px frame shows the phone layout).
export function scopeCss(css, scope = ".app") {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const out = [];
  function block(prefixRules, insideKeyframes) {
    // parses until the matching "}" (or end) and returns the CSS text
    let buf = "";
    while (i < css.length) {
      const ch = css[i];
      if (ch === "}") {
        i++;
        return buf;
      }
      // read a prelude up to "{" or ";"
      let prelude = "";
      while (
        i < css.length &&
        css[i] !== "{" &&
        css[i] !== "}" &&
        css[i] !== ";"
      )
        prelude += css[i++];
      if (css[i] === ";") {
        i++;
        if (prelude.trim()) buf += prelude.trim() + ";";
        continue;
      }
      if (css[i] === "}") continue;
      i++; // skip "{"
      const p = prelude.trim();
      if (!p) {
        block(false, insideKeyframes);
        continue;
      }
      if (p.startsWith("@")) {
        const name = p.slice(1).split(/[\s(]/)[0];
        if (
          ["keyframes", "font-face", "page", "-webkit-keyframes"].includes(name)
        ) {
          const inner = rawBlock();
          buf += p + "{" + inner + "}";
        } else if (name === "media") {
          const q = p.slice(6).trim();
          const isWidth = /^\(\s*(max|min)-width\s*:\s*[\d.]+px\s*\)$/.test(q);
          const inner = block(true, false);
          buf += (isWidth ? "@container app " + q : p) + "{" + inner + "}";
        } else {
          const inner = block(true, false);
          buf += p + "{" + inner + "}";
        }
        continue;
      }
      if (insideKeyframes) {
        const inner = rawBlock();
        buf += p + "{" + inner + "}";
        continue;
      }
      const inner = rawBlock();
      buf += scopeSelectors(p, scope) + "{" + inner + "}";
    }
    return buf;
  }
  function rawBlock() {
    let depth = 1,
      s = "";
    while (i < css.length) {
      const ch = css[i++];
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (!depth) return s.trim();
      }
      s += ch;
    }
    return s.trim();
  }
  while (i < css.length) out.push(block(false, false));
  return out.join("\n");
}
function splitSelectors(list) {
  const parts = [];
  let depth = 0,
    cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && !depth) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}
export function scopeSelectors(list, scope) {
  return splitSelectors(list)
    .map((sel) => {
      const dark = /^(:root)?\[data-theme="dark"\]/;
      if (sel === ":root") return scope;
      if (dark.test(sel)) {
        const rest = sel.replace(dark, "").trim();
        return rest
          ? `:root[data-theme="dark"] ${scope} ${rest}`
          : `:root[data-theme="dark"] ${scope}`;
      }
      if (sel === "html" || sel === "body") return scope;
      if (/^body[.:\[]/.test(sel)) return scope + sel.slice(4);
      if (sel.startsWith("body ")) return scope + sel.slice(4);
      if (sel === "*") return scope + " *";
      return scope + " " + sel;
    })
    .join(",");
}
