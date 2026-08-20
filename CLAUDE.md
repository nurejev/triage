# CLAUDE.md — working notes for this repo

## Working preferences (Mihai)

- **Always give the exact commands to copy/paste.** When a step involves the
  shell (git, docker, bump, PowerShell, etc.), show the runnable command(s) in a
  copyable code block so I can paste them myself — do this even when you also run
  them for me.
- **Git identity for this repo:** `Mihai Monte <Mihai@limon-it.nl>` (already set
  as the repo-local `user.name` / `user.email`).

## Repo facts worth remembering

- Static SPA (no build step for the app itself): `index.html` + `js/*.js` +
  `css/app.css`, MSAL vendored in `vendor/`. Hosted on GitHub Pages
  (`triage.limon-it.nl`) and also runnable via Docker.
- `python3 bump.py "<title>" "kind|tool|text" ...` bumps the build number, adds
  a "What's new" changelog entry, and refreshes the `?v=` cache-busters. Bump on
  every change; `kind` is `new` / `improved` / `fixed`.
- Docker: three optional images — web (nginx + strict CSP), Exchange containment
  backend (holds a certificate; see `SECURITY.md`), and the PowerShell companion
  (Extractor-Suite preinstalled). None are required for browser use.

## Shell

- Mihai runs **PowerShell** (pwsh on macOS). Give copy/paste commands in
  PowerShell syntax, not bash.

## Environment quirks

- **Claude's sandbox only:** when Claude operates on this repo from its sandbox,
  the mount blocks file *deletion* inside `.git` (create and rename work, unlink
  does not), so Claude's own `git commit` can leave a stale `.git/index.lock`.
  On **Mihai's own machine, normal deletion works** — if a commit ever complains
  that `index.lock` exists, just remove it:
  `Remove-Item .git/index.lock -Force` then re-run the commit.
- Prefer letting Mihai run `git commit`/`git push` from his own shell; Claude's
  sandbox git state does not always match the host.
