#!/usr/bin/env bash
# Match the GitHub Pages project path while serving the release files unchanged.
set -e
cd "$(git rev-parse --show-toplevel)"
stage="$(mktemp -d "${TMPDIR:-/tmp}/brick-track-planner-playwright.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
trap 'exit 143' TERM
ln -s "$PWD/dist" "$stage/brick-track-planner"
source source_me.sh && python3 -m http.server "$1" --bind 127.0.0.1 --directory "$stage"
