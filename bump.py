#!/usr/bin/env python3
"""Bump the build number, add an ENCA-style changelog entry, refresh ?v= cache-busters.

Usage:  python3 bump.py "Release title" "kind|tool|text" ["kind|tool|text" ...]
        kind is new, improved or fixed.

Example:
    python3 bump.py "Sign-in enabled" "new|Sign in|App registration configured."
"""
import datetime, re, sys

if len(sys.argv) < 3:
    sys.exit(__doc__)
title = sys.argv[1]
items = []
for raw in sys.argv[2:]:
    parts = raw.split("|", 2)
    if len(parts) != 3 or parts[0] not in ("new", "improved", "fixed"):
        sys.exit("Item must be 'kind|tool|text' with kind new/improved/fixed: " + raw)
    items.append(parts)

build_js = open("js/build.js", encoding="utf-8").read()
cur = int(re.search(r"TRIAGE_BUILD = (\d+)", build_js).group(1))
new = cur + 1
today = datetime.date.today().isoformat()

def q(s):
    return s.replace('"', '\\"')

lines = "\n".join('      { kind: "%s", tool: "%s", text: "%s" },' % (k, q(t), q(x)) for k, t, x in items)
entry = '  {\n    build: %d, date: "%s", title: "%s",\n    items: [\n%s\n    ],\n  },' % (new, today, q(title), lines)

build_js = re.sub(r"TRIAGE_BUILD = \d+", "TRIAGE_BUILD = %d" % new, build_js)
build_js = re.sub(r'TRIAGE_BUILD_DATE = "[^"]*"', 'TRIAGE_BUILD_DATE = "%s"' % today, build_js)
build_js = build_js.replace("window.TRIAGE_CHANGELOG = [", "window.TRIAGE_CHANGELOG = [\n" + entry, 1)
open("js/build.js", "w", encoding="utf-8").write(build_js)

html = open("index.html", encoding="utf-8").read()
html = re.sub(r"\?v=\d+", "?v=%d" % new, html)
open("index.html", "w", encoding="utf-8").write(html)

print('Build %d -> %d (%s) "%s" with %d item(s). Commit and push to deploy.' % (cur, new, today, title, len(items)))
