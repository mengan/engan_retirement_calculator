#!/usr/bin/env python3
"""Simple HTTP server for the retirement calculator.

Serves static files from this directory and exposes:
  GET  /api/state   -> returns saved state JSON (or {} if none)
  POST /api/state   -> persists request body (JSON) to state.json
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8888
HERE = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(HERE, "state.json")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def log_message(self, fmt, *args):
        # keep server output quiet
        pass

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/state":
            if os.path.exists(STATE_FILE):
                try:
                    with open(STATE_FILE, "r") as f:
                        data = json.load(f)
                    self._send_json(200, data)
                    return
                except Exception as e:
                    self._send_json(500, {"error": str(e)})
                    return
            self._send_json(200, {})
            return
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/state":
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            try:
                data = json.loads(raw.decode("utf-8"))
            except Exception as e:
                self._send_json(400, {"error": "invalid JSON: " + str(e)})
                return
            try:
                tmp = STATE_FILE + ".tmp"
                with open(tmp, "w") as f:
                    json.dump(data, f, indent=2)
                os.replace(tmp, STATE_FILE)
                self._send_json(200, {"ok": True})
            except Exception as e:
                self._send_json(500, {"error": str(e)})
            return
        self._send_json(404, {"error": "not found"})


if __name__ == "__main__":
    with ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Retirement calculator running at http://localhost:{PORT}")
        httpd.serve_forever()
