"""Static server with HTTP Range support, so the FLAC waveform seek behaves.

`python -m http.server` ignores Range, so the browser cannot seek inside a
progressive FLAC and every attempt restarts at 0. The real app gets this from
Hono's serve-static (Accept-Ranges / 206); this file is the preview equivalent.

    python tools/serve_range.py 5271
"""

import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHUNK = 256 * 1024
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")

mimetypes.add_type("audio/flac", ".flac")
mimetypes.add_type("text/javascript", ".js")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):  # noqa: N802
        self._send(head_only=False)

    def do_HEAD(self):  # noqa: N802
        self._send(head_only=True)

    def _resolve(self):
        path = self.path.split("?", 1)[0]
        if path in ("", "/"):
            path = "/index.html"
        target = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not target.startswith(ROOT) or not os.path.isfile(target):
            return None
        return target

    def _send(self, head_only):
        target = self._resolve()
        if target is None:
            self.send_error(404, "File not found")
            return
        size = os.path.getsize(target)
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        start, end = 0, size - 1
        status = 200
        header = self.headers.get("Range")
        if header:
            match = RANGE_RE.fullmatch(header.strip())
            if match:
                first, last = match.groups()
                if first:
                    start = int(first)
                    end = int(last) if last else size - 1
                elif last:
                    start = max(size - int(last), 0)
                if start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                end = min(end, size - 1)
                status = 206

        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if head_only:
            return
        with open(target, "rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                block = fh.read(min(CHUNK, remaining))
                if not block:
                    break
                self.wfile.write(block)
                remaining -= len(block)

    def log_message(self, fmt, *args):
        if os.environ.get("SERVE_QUIET") != "1":
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5271
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"serving {ROOT} on http://127.0.0.1:{port}/ with Range support", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
