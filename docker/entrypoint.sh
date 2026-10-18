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

if [ "${GIT_SYNC:-off}" = "on" ]; then
    echo "[triage] pulling latest from $REPO ($REF)..."
    if git clone --quiet --depth 1 --branch "$REF" "$REPO" /tmp/site 2>/dev/null; then
        rm -rf "$ROOT"/*
        for asset in index.html js css assets vendor; do
            cp -R "/tmp/site/$asset" "$ROOT/"
        done
        mkdir -p "$ROOT/BETA"
        for asset in index.html tenant.html js css assets vendor docs; do
            if [ -e "/tmp/site/BETA/$asset" ]; then cp -R "/tmp/site/BETA/$asset" "$ROOT/BETA/"; fi
        done
        rm -rf /tmp/site
        BUILD=$(sed -n 's/^window.TRIAGE_BUILD = \([0-9]*\);.*/\1/p' "$ROOT/js/build.js" 2>/dev/null || true)
        echo "[triage] serving build ${BUILD:-?} fresh from GitHub."
    else
        echo "[triage] clone failed - serving the copy baked into the image."
    fi
else
    echo "[triage] GIT_SYNC=off - serving the copy baked into the image."
fi

# Public identifiers only. Reject malformed values rather than interpolating arbitrary script.
for appid in "${BACKEND_APP_ID:-}" "${BETA_COLLECTOR_APP_ID:-}"; do
    if [ -n "$appid" ] && ! printf '%s' "$appid" | grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; then
        echo "Invalid public application ID" >&2; exit 1
    fi
done
cat > "$ROOT/js/config.js" <<EOF_CONFIG
window.TRIAGE_CONFIG = { backendAppId: "${BACKEND_APP_ID:-}", backendBase: "/api" };
EOF_CONFIG
cat > "$ROOT/BETA/js/config.js" <<EOF_CONFIG
window.BETA_CONFIG = { collectorAppId: "${BETA_COLLECTOR_APP_ID:-}", collectorBase: "/api" };
EOF_CONFIG
find "$ROOT" -type d -exec chmod 755 {} \;
find "$ROOT" -type f -exec chmod 644 {} \;
exec nginx -g 'daemon off;'
