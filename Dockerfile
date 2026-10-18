# ======================================================================
#  Limon-IT M365 Triage - web container
#
#  Serves the baked-in static SPA with nginx. Git updates are opt-in.
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
#    GIT_SYNC=off   default: serve the baked-in copy (no network at start)
#    GIT_REPO=...   pull from a fork instead (default: this repo)
#    GIT_REF=...    branch or tag to pull (default: main)
# ======================================================================
FROM nginx:alpine@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3

RUN apk add --no-cache git gettext

# Rendered by the entrypoint (it substitutes the backend host), not used raw.
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && rm -f /etc/nginx/conf.d/default.conf

# Baked-in fallback copy of the site (kept current by the GHCR workflow).
COPY index.html /usr/share/nginx/html/index.html
COPY js/ /usr/share/nginx/html/js/
COPY css/ /usr/share/nginx/html/css/
COPY assets/ /usr/share/nginx/html/assets/
COPY vendor/ /usr/share/nginx/html/vendor/
COPY BETA/index.html /usr/share/nginx/html/BETA/index.html
COPY BETA/tenant.html /usr/share/nginx/html/BETA/tenant.html
COPY BETA/js/ /usr/share/nginx/html/BETA/js/
COPY BETA/css/ /usr/share/nginx/html/BETA/css/
COPY BETA/assets/ /usr/share/nginx/html/BETA/assets/
COPY BETA/vendor/ /usr/share/nginx/html/BETA/vendor/
COPY BETA/docs/ /usr/share/nginx/html/BETA/docs/

RUN find /usr/share/nginx/html -type d -exec chmod 755 {} \; \
 && find /usr/share/nginx/html -type f -exec chmod 644 {} \;

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
