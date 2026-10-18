# Graph sessions are process-scoped. The host closes its response worker before this acknowledgement.
# Do not delete another tool's shared Graph/Azure token caches.
param([Parameter(Mandatory)][string]$ModuleRoot)
@{disconnected=$true;account='';note='In-memory Triage sessions closed. Browser sign-in and other tools are unchanged.'}|ConvertTo-Json -Compress
