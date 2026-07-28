// ======================================================================
//  Runtime configuration - the one file the Docker container rewrites on
//  start from environment variables. Everything here is public by nature
//  (it ships to the browser); never put a secret in it.
//
//  backendAppId  Application ID of the Exchange containment backend. Empty
//                means "no backend": the tool still does everything else,
//                and the inbox-rules step falls back to copy-paste
//                PowerShell instead of buttons.
//  backendBase   Where the API lives. Same-origin by default, because
//                nginx in the image proxies /api to the backend container -
//                no CORS, and the Content-Security-Policy stays tight.
// ======================================================================
window.TRIAGE_CONFIG = {
  backendAppId: "",
  backendBase: "/api"
};
