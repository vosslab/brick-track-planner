#!/usr/bin/env bash
# Match the GitHub Pages project path while serving the release files unchanged.
set -e
cd "$(git rev-parse --show-toplevel)"
stage="$(mktemp -d "${TMPDIR:-/tmp}/brick-track-planner-playwright.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
trap 'exit 143' TERM
ln -s "$PWD/dist" "$stage/brick-track-planner"
source source_me.sh && python3 - "$1" "$stage" <<'PY'
import functools
import http.server
import sys


class PagesServer(http.server.ThreadingHTTPServer):
	request_queue_size = 64


handler = functools.partial(
	http.server.SimpleHTTPRequestHandler,
	directory=sys.argv[2],
)
with PagesServer(("127.0.0.1", int(sys.argv[1])), handler) as server:
	server.serve_forever()
PY
