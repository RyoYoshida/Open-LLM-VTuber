#!/usr/bin/env python3
"""Standalone Live2D browser demo server.

This server is intentionally independent from the main Open-LLM-VTuber backend.
It serves a tiny web app plus local Live2D model assets from this repository.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from model_catalog import load_model_entries


APP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = APP_DIR.parents[1]
LIVE2D_MODELS_DIR = PROJECT_ROOT / "live2d-models"
LIVE2D_CORE_JS_CANDIDATES = [
    PROJECT_ROOT / "frontend" / "libs" / "live2dcubismcore.min.js",
    PROJECT_ROOT / "frontend" / "libs" / "live2dcubismcore.js",
    PROJECT_ROOT / "libs" / "live2dcubismcore.min.js",
]


def resolve_live2d_core_js() -> Path:
    """Resolve the Live2D core runtime JS path from known locations."""
    for candidate in LIVE2D_CORE_JS_CANDIDATES:
        if candidate.exists() and candidate.is_file():
            return candidate

    # Keep behavior deterministic: return the first expected path if none exists.
    return LIVE2D_CORE_JS_CANDIDATES[0]


LIVE2D_CORE_JS = resolve_live2d_core_js()


class Live2DDemoHandler(SimpleHTTPRequestHandler):
    """Request handler that serves demo UI, model assets, and a models API."""

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/model-configs":
            self._handle_model_configs_api()
            return

        if path == "/api/models":
            self._handle_models_api()
            return

        if path == "/vendor/live2dcubismcore.min.js":
            self._send_file(LIVE2D_CORE_JS)
            return

        if path.startswith("/live2d-models/"):
            rel = path.removeprefix("/live2d-models/")
            target = (LIVE2D_MODELS_DIR / rel).resolve()
            if not str(target).startswith(str(LIVE2D_MODELS_DIR.resolve())):
                self.send_error(HTTPStatus.FORBIDDEN, "Forbidden")
                return
            self._send_file(target)
            return

        if path == "/":
            self.path = "/index.html"
        else:
            self.path = path

        super().do_GET()

    def log_message(self, format: str, *args: object) -> None:
        # Keep stdout concise while still providing useful request info.
        print(f"[live2d-standalone] {self.address_string()} - {format % args}")

    def _handle_models_api(self) -> None:
        models = self._load_model_configs()
        payload = [
            {
                "name": str(model.get("name", "unknown")),
                "path": str(model.get("url", "")),
                "folder": str(model.get("url", "")).split("/runtime/")[0].lstrip("/"),
            }
            for model in models
        ]

        body = self._to_json_body({"models": payload})
        self._send_json(body)

    def _handle_model_configs_api(self) -> None:
        body = self._to_json_body({"models": self._load_model_configs()})
        self._send_json(body)

    def _load_model_configs(self) -> list[dict[str, object]]:
        return load_model_entries()

    def _send_json(self, body: bytes) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _to_json_body(self, payload: object) -> bytes:
        import json

        return json.dumps(payload, ensure_ascii=False).encode("utf-8")

    def _send_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        ctype, _ = mimetypes.guess_type(str(path))
        data = path.read_bytes()

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Standalone Live2D demo server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=8765, help="Bind port")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    handler_cls = lambda *h_args, **h_kwargs: Live2DDemoHandler(  # noqa: E731
        *h_args,
        directory=str(APP_DIR),
        **h_kwargs,
    )

    with ThreadingHTTPServer((args.host, args.port), handler_cls) as server:
        print(
            f"Live2D standalone demo running on http://{args.host}:{args.port} "
            f"(serving {APP_DIR})"
        )
        print("Press Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
