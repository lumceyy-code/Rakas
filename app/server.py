from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from app.providers import ProviderResolver
from app.store import CatalogStore

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
DATA_PATH = ROOT / "data" / "catalog.json"
FEEDBACK_PATH = ROOT / "data" / "feedback.jsonl"

store = CatalogStore(DATA_PATH)
resolver = ProviderResolver(provider_health={"alpha": True, "beta": True, "gamma": False})


class PiraterHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def _json(self, payload: dict | list, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/trending":
            return self._json(store.trending())

        if parsed.path == "/api/search":
            query = parse_qs(parsed.query).get("q", [""])[0]
            return self._json(store.search(query))

        if parsed.path.startswith("/api/title/"):
            title_id = parsed.path.rsplit("/", 1)[-1]
            title = store.by_id(title_id)
            if not title:
                return self._json({"error": "Title not found"}, HTTPStatus.NOT_FOUND)
            return self._json(title)

        if parsed.path.startswith("/api/stream/"):
            title_id = parsed.path.rsplit("/", 1)[-1]
            title = store.by_id(title_id)
            if not title:
                return self._json({"error": "Title not found"}, HTTPStatus.NOT_FOUND)
            resolved = resolver.resolve(title.get("streams", []))
            if not resolved:
                return self._json({"error": "No healthy providers"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return self._json({"provider": resolved.provider, "url": resolved.url, "quality": resolved.quality})

        return super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/feedback":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        payload = self.rfile.read(content_length)
        try:
            parsed_payload = json.loads(payload or b"{}")
        except json.JSONDecodeError:
            return self._json({"error": "Invalid JSON"}, HTTPStatus.BAD_REQUEST)

        parsed_payload["ip"] = self.client_address[0]
        FEEDBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
        with FEEDBACK_PATH.open("a", encoding="utf-8") as fp:
            fp.write(json.dumps(parsed_payload) + "\n")

        return self._json({"ok": True}, HTTPStatus.CREATED)


def run() -> None:
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), PiraterHandler)
    print(f"The Pirater dev server on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
