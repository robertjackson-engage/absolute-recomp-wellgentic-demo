#!/usr/bin/env python3
"""Absolute Recomp demo server: static site + server-side Wellgentic proxy.

The chat widget posts to /api/wellgentic on this server; we forward to the
Wellgentic embedded-chat API with the key from WELLGENTIC_API_KEY, so the key
never appears in any committed file or in client-side code.

Provide the key either way:
  1. Export it:        WELLGENTIC_API_KEY=abs_...  python3 serve.py
  2. Or drop a .env:   echo 'WELLGENTIC_API_KEY=abs_...' > .env  &&  python3 serve.py
The .env file is gitignored, so the key never reaches the repo.
"""
import http.server
import json
import os
import socketserver
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "docs")
PORT = int(os.environ.get("PORT", "4182"))
WG_BASE = "https://app.wellgentic.ai/api/widget/chat"
WORKFLOW_ID = int(os.environ.get("WELLGENTIC_WORKFLOW_ID", "78"))


def load_dotenv():
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


load_dotenv()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SITE, **kw)

    def log_message(self, fmt, *args):
        pass

    def do_POST(self):
        if self.path != "/api/wellgentic":
            self.send_error(404)
            return
        key = os.environ.get("WELLGENTIC_API_KEY", "")
        if not key:
            self._json(500, {"error": "WELLGENTIC_API_KEY not set (see serve.py docstring)"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self._json(400, {"error": "bad request"})
            return

        action = payload.pop("action", "message")
        url = WG_BASE + ("/init" if action == "init" else "")
        payload.setdefault("workflowId", WORKFLOW_ID)
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self._raw(resp.status, resp.read())
        except urllib.error.HTTPError as e:
            self._raw(e.code, e.read())
        except Exception as e:
            self._json(502, {"error": str(e)})

    def _json(self, code, obj):
        self._raw(code, json.dumps(obj).encode())

    def _raw(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    has_key = bool(os.environ.get("WELLGENTIC_API_KEY"))
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as srv:
        print(f"Absolute Recomp demo on http://localhost:{PORT}  (Wellgentic key present: {has_key})")
        srv.serve_forever()
