#!/usr/bin/env bash
# Run local release checks against the Rust engine and Pages artifact.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

cargo test --locked
./build_github_pages.sh
node --import tsx --test 'tests/test_*.mjs'
./run_playwright_tests.sh "$@"
