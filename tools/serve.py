# Static server for the Pokédex pages that tells the browser never to cache them,
# so an edited page always shows up on reload.  Usage: python3 tools/serve.py [port]
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8820
root = Path(__file__).resolve().parent.parent
ThreadingHTTPServer(("", port), partial(NoCacheHandler, directory=str(root))).serve_forever()
