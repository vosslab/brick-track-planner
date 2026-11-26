#!/usr/bin/env bash
# Verify the Rust engine and the browser artifact built for Pages.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

cargo test --locked
./build_github_pages.sh
node --import tsx --test 'tests/test_*.mjs'
./run_playwright_tests.sh "$@"
