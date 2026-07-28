# ======================================================================
#  Limon-IT M365 Triage - web container
#
#  Serves the static SPA with nginx. On every container start it pulls the
#  latest main from GitHub and serves that; if the clone fails (offline,
#  rate-limited) it falls back to the copy baked in at build time.
#
#  Build straight from GitHub (no checkout needed):
#      docker build -t m365-triage https://github.com/nurejev/triage.git
#      docker run --rm -p 8080:80 m365-triage
#
#  Or pull the image Actions publishes:
#      docker run --rm -p 8080:80 ghcr.io/nurejev/triage:latest
#
#  Open http://localhost:8080 - that redirect URI is registered on the
#  app registration, so sign-in and consent work out of the box.
#
#  Env:
#    GIT_SYNC=off   serve only the baked-in copy (no network at start)
#    GIT_REPO=...   pull from a fork instead (default: this repo)
#    GIT_REF=...    branch or tag to pull (default: main)
# ======================================================================
FROM nginx:alpine

RUN apk add --no-cache git

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Baked-in fallback copy of the site (kept current by the GHCR workflow).
COPY . /usr/share/nginx/html/
RUN rm -rf /usr/share/nginx/html/.git /usr/share/nginx/html/docker \
    /usr/share/nginx/html/Dockerfile* /usr/share/nginx/html/docker-compose.yml

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
