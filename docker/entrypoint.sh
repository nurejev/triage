#!/bin/sh
# Pull the latest site from GitHub on start, fall back to the baked-in copy.
set -e

REPO="${GIT_REPO:-https://github.com/nurejev/triage.git}"
REF="${GIT_REF:-main}"
ROOT=/usr/share/nginx/html

# Where /api is proxied. Defaults to the compose service name; nginx resolves
# it lazily so a missing backend does not stop the web app from starting.
export TRIAGE_BACKEND_HOST="${TRIAGE_BACKEND_HOST:-backend}"
envsubst '${TRIAGE_BACKEND_HOST}' \
    < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

if [ "${GIT_SYNC:-on}" = "on" ]; then
    echo "[triage] pulling latest from $REPO ($REF)..."
    if git clone --quiet --depth 1 --branch "$REF" "$REPO" /tmp/site 2>/dev/null; then
        rm -rf "$ROOT"/*
        cp -R /tmp/site/. "$ROOT"/
        rm -rf "$ROOT/.git" "$ROOT/docker" "$ROOT/backend" "$ROOT/certs" \
               "$ROOT"/Dockerfile* "$ROOT/docker-compose.yml" "$ROOT"/*.env /tmp/site
        BUILD=$(sed -n 's/^window.TRIAGE_BUILD = \([0-9]*\);.*/\1/p' "$ROOT/js/build.js" 2>/dev/null || true)
        echo "[triage] serving build ${BUILD:-?} fresh from GitHub."
    else
        echo "[triage] clone failed - serving the copy baked into the image."
    fi
else
    echo "[triage] GIT_SYNC=off - serving the copy baked into the image."
fi

# Runtime config for the SPA. Only public values - never a secret. Written
# after the git pull so it survives the refresh.
cat > "$ROOT/js/config.js" <<EOF
// Generated at container start from environment variables.
window.TRIAGE_CONFIG = {
  backendAppId: "${BACKEND_APP_ID:-}",
  backendBase: "${BACKEND_BASE:-/api}"
};
EOF
if [ -n "${BACKEND_APP_ID:-}" ]; then
    echo "[triage] Exchange containment backend enabled (app $BACKEND_APP_ID)."
else
    echo "[triage] No Exchange backend configured - the mailbox step falls back to PowerShell."
fi

exec nginx -g 'daemon off;'
