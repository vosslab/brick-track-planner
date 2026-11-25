#!/usr/bin/env bash
# Verify the Rust engine and the browser artifact built for Pages.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
./build_github_pages.sh
./check_codebase.sh
./run_playwright_tests.sh "$@"
