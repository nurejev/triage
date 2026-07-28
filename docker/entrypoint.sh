#!/bin/sh
# Pull the latest site from GitHub on start, fall back to the baked-in copy.
set -e

REPO="${GIT_REPO:-https://github.com/nurejev/triage.git}"
REF="${GIT_REF:-main}"
ROOT=/usr/share/nginx/html

if [ "${GIT_SYNC:-on}" = "on" ]; then
    echo "[triage] pulling latest from $REPO ($REF)..."
    if git clone --quiet --depth 1 --branch "$REF" "$REPO" /tmp/site 2>/dev/null; then
        rm -rf "$ROOT"/*
        cp -R /tmp/site/. "$ROOT"/
        rm -rf "$ROOT/.git" "$ROOT/docker" "$ROOT"/Dockerfile* "$ROOT/docker-compose.yml" /tmp/site
        BUILD=$(sed -n 's/^window.TRIAGE_BUILD = \([0-9]*\);.*/\1/p' "$ROOT/js/build.js" 2>/dev/null || true)
        echo "[triage] serving build ${BUILD:-?} fresh from GitHub."
    else
        echo "[triage] clone failed - serving the copy baked into the image."
    fi
else
    echo "[triage] GIT_SYNC=off - serving the copy baked into the image."
fi

exec nginx -g 'daemon off;'
