# ======================================================================
#  Limon-IT M365 Triage - Exchange containment backend
#
#  PowerShell (for Exchange Online app-only) + Node (for the HTTP API and
#  token verification). No npm packages: the API is one dependency-free
#  file, so the supply chain to audit is server.js and the two Microsoft
#  base layers.
#
#  Not started by `docker compose up` unless you enable the "backend"
#  profile - the tool works without it, just with the inbox-rules step as
#  copy-paste PowerShell instead of buttons.
# ======================================================================
FROM mcr.microsoft.com/powershell:lts-debian-12

# Node for the API. Debian 12 ships Node 18, which has everything we use.
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs ca-certificates \
 && rm -rf /var/lib/apt/lists/*

SHELL ["pwsh", "-Command"]
RUN Set-PSRepository PSGallery -InstallationPolicy Trusted; \
    Install-Module ExchangeOnlineManagement -Scope AllUsers -Force
SHELL ["/bin/sh", "-c"]

WORKDIR /opt/triage
COPY backend/server.js /opt/triage/server.js
COPY backend/exo.ps1  /opt/triage/exo.ps1

# Runs unprivileged. The certificate is mounted read-only at /certs.
RUN useradd -r -u 10001 -m -d /home/triage triage \
 && mkdir -p /var/log/triage /certs \
 && chown -R triage:triage /var/log/triage /opt/triage
USER triage

ENV PORT=8081
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8081)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "/opt/triage/server.js"]
