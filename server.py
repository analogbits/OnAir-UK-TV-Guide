#!/usr/bin/env python3
"""
Lightweight local server + CORS proxy for OnAir UK TV Guide.
Run: python3 server.py
Then open: http://localhost:8765
"""

import http.server
import socketserver
import time
import urllib.parse
import urllib.request
import urllib.error
import os

PORT = int(os.environ.get("PORT", 8765))
PROXY_CACHE_TTL = 30 * 60  # 30 minutes to minimize external data calls
_proxy_cache = {}
ALLOWED_HOSTS = {
    "api.pluto.tv",
    "tubitv.com",
    "epg.production-public.tubi.io",
    "epg-cdn.production-public.tubi.io",
    "awk.epgsky.com",
    "feeds.bbci.co.uk",
}


class OnAirHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/proxy":
            qs = urllib.parse.parse_qs(parsed.query)
            target = (qs.get("url") or [""])[0]
            target_host = urllib.parse.urlparse(target).hostname or ""
            if target_host not in ALLOWED_HOSTS:
                self.send_response(403)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error":"Host not allowed"}')
                return

            cached = _proxy_cache.get(target)
            if cached and time.time() - cached[0] < PROXY_CACHE_TTL:
                self.send_response(200)
                self.send_header("Content-Type", cached[1])
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=1800")
                self.end_headers()
                self.wfile.write(cached[2])
                return

            req = urllib.request.Request(
                target,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/html, */*",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    body = resp.read()
                    ctype = resp.headers.get("Content-Type", "application/octet-stream")
                    if resp.status == 200 and len(body) < 6 * 1024 * 1024:
                        _proxy_cache[target] = (time.time(), ctype, body)
                    self.send_response(resp.status)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "public, max-age=1800")
                    self.end_headers()
                    self.wfile.write(body)
            except urllib.error.HTTPError as err:
                self.send_response(err.code)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(str(err).encode("utf-8"))
            except Exception as err:
                self.send_response(502)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(str(err).encode("utf-8"))
            return

        super().do_GET()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), OnAirHandler) as httpd:
        print(f"OnAir UK running at http://localhost:{PORT} (with Pluto/Tubi CORS proxy)")
        httpd.serve_forever()
