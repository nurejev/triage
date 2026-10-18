"""Loopback-only experiment server. Exposes no repository or credential directory."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        route = self.path.split('?', 1)[0]
        if route == '/':
            body, mime = b'<!doctype html><title>Microsoft sign-in callback</title>', 'text/html'
        elif route == '/probe':
            body, mime = (HERE / 'admin-api-probe.html').read_bytes(), 'text/html'
        elif route == '/msal.js':
            body, mime = (ROOT / 'vendor/msal-browser.min.js').read_bytes(), 'text/javascript'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', mime + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass  # Do not log OAuth callback query strings.

if __name__ == '__main__':
    print('Read-only probe: http://localhost:8091/probe', flush=True)
    HTTPServer(('127.0.0.1', 8091), Handler).serve_forever()
