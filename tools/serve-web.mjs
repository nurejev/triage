// Local static website only. Collection runs in the browser or portable app.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com; frame-src 'self' https://login.microsoftonline.com; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
export function createWebServer() {
  return http.createServer((req, res) => {
    const hostname = (req.headers.host || "").split(":")[0];
    if (!["localhost", "127.0.0.1"].includes(hostname)) {
      res.writeHead(403).end();
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    try {
      const url = new URL(req.url, "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const parts = pathname.split("/").filter(Boolean);
      if (
        parts.some(
          (p) => p.startsWith(".") || p.includes("\\") || p.includes("\0"),
        ) ||
        !["BETA", "js", "css", "assets", "vendor", "index.html"].includes(
          parts[0],
        )
      ) {
        res.writeHead(404).end();
        return;
      }
      const file = path.resolve(root, ...parts),
        type = types[path.extname(file)];
      if (
        !type ||
        !file.startsWith(root + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile() ||
        !fs.realpathSync(file).startsWith(root + path.sep)
      ) {
        res.writeHead(404).end();
        return;
      }
      if (
        pathname.startsWith("/BETA/downloads/") &&
        !/^\/BETA\/downloads\/(Triage-(macOS-arm64|Windows-x64)\.zip|SHA256SUMS\.txt)$/.test(
          pathname,
        )
      ) {
        res.writeHead(404).end();
        return;
      }
      const size = fs.statSync(file).size;
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": size,
        "Content-Security-Policy": csp,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "SAMEORIGIN",
      });
      if (req.method === "HEAD") res.end();
      else
        fs.createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
    } catch {
      res.writeHead(400).end();
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.TRIAGE_WEB_PORT || 8080);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error("TRIAGE_WEB_PORT must be a port between 1024 and 65535");
  const server = createWebServer();
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is in use. Stop the previous local website, or set TRIAGE_WEB_PORT.`
        : error.message,
    );
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Triage website: http://localhost:${port}/BETA/\nLocal static server. No Docker or collection backend. Press Ctrl+C to stop.`,
    ),
  );
  for (const event of ["SIGINT", "SIGTERM"])
    process.on(event, () => server.close());
}
