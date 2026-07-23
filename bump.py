#!/usr/bin/env python3
"""Bump the build number, add a what's-new entry, and refresh ?v= cache-busters.

Usage:  python3 bump.py "Added X" "Fixed Y"
"""
import datetime, re, sys

changes = sys.argv[1:]
if not changes:
    sys.exit('Give at least one change note: python3 bump.py "Added X"')

build_js = open("js/build.js", encoding="utf-8").read()
cur = int(re.search(r"TRIAGE_BUILD = (\d+)", build_js).group(1))
new = cur + 1
today = datetime.date.today().isoformat()

entry = ('  {\n    build: %d, date: "%s", changes: [\n%s\n    ]\n  },' %
         (new, today, ",\n".join('      "%s"' % c.replace('"', '\\"') for c in changes)))
build_js = re.sub(r"TRIAGE_BUILD = \d+", "TRIAGE_BUILD = %d" % new, build_js)
build_js = re.sub(r'TRIAGE_BUILD_DATE = "[^"]*"', 'TRIAGE_BUILD_DATE = "%s"' % today, build_js)
build_js = build_js.replace("window.TRIAGE_CHANGELOG = [", "window.TRIAGE_CHANGELOG = [\n" + entry, 1)
open("js/build.js", "w", encoding="utf-8").write(build_js)

html = open("index.html", encoding="utf-8").read()
html = re.sub(r"\?v=\d+", "?v=%d" % new, html)
open("index.html", "w", encoding="utf-8").write(html)

print("Build %d -> %d (%s). Commit and push to deploy." % (cur, new, today))
