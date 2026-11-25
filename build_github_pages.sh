#!/usr/bin/env bash
# build_github_pages.sh - canonical production build for GitHub Pages.
#
# Run this directly as ./build_github_pages.sh.
#
# Contract:
#   - Wipes dist/ from scratch.
#   - Builds the locked Rust crate and generates browser Wasm bindings.
#   - Type-checks via 'tsc --noEmit -p tsconfig.json'.
#   - Resolves the entry: src/main.ts preferred, src/init.ts legacy fallback.
#     Aborts with an actionable error if neither exists.
#   - Verifies src/index.html and src/style.css exist before copying;
#     aborts with an actionable error if missing.
#   - Verifies src/index.html references dist/main.js with a module script
#     tag (warns if missing -- the page will load but main.js is dead).
#   - Bundles dist/main.js and on-demand chunks with esbuild (ESM,
#     es2020, browser, minified, with sourcemaps).
#   - Copies HTML, CSS, examples, and the Wasm binary into dist/.
#   - Writes dist/.nojekyll so GitHub Pages serves files starting with _.
#   - Asserts the HTML, JavaScript, and Wasm outputs before exiting.
#
# Hard rule: never produces single-file output. ESM only.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Resolve entry point.
if [ -f "src/main.ts" ]; then
	ENTRY="src/main.ts"
elif [ -f "src/init.ts" ]; then
	ENTRY="src/init.ts"
	echo "WARNING: using legacy src/init.ts. Rename to src/main.ts." >&2
else
	echo "ERROR: no entry point. Create src/main.ts (preferred) or src/init.ts." >&2
	exit 1
fi

# Verify required static assets before any destructive step.
for required in src/index.html src/style.css; do
	if [ ! -f "$required" ]; then
		echo "ERROR: required source file missing: $required" >&2
		case "$required" in
			src/index.html)
				echo "  Create src/index.html with a <script type=\"module\" src=\"main.js\"></script> tag." >&2 ;;
			src/style.css)
				echo "  Create src/style.css (empty file is fine)." >&2 ;;
		esac
		exit 1
	fi
done
if ! compgen -G 'examples/*.btp.json' >/dev/null || ! compgen -G 'examples/*.bbm' >/dev/null; then
	echo "ERROR: the native and BlueBrick example projects are required under examples/." >&2
	exit 1
fi

# Soft-warn if index.html does not reference main.js as an ES module.
if ! grep -Eq '<script[^>]+type="module"[^>]+src="(\./)?main\.js"' src/index.html; then
	echo "WARNING: src/index.html does not appear to load main.js as an ES module." >&2
	echo "  Expected tag: <script type=\"module\" src=\"main.js\"></script>" >&2
	echo "  Build will proceed; the page may render but main.js will not run." >&2
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
	echo "ERROR: wasm-pack not found on PATH. Install wasm-pack before building." >&2
	exit 1
fi
wasm-pack build . --target web --release --out-dir generated/wasm --out-name track_geometry -- --locked

./node_modules/.bin/tsc --noEmit -p tsconfig.json

rm -rf dist
mkdir -p dist/wasm dist/examples

./node_modules/.bin/esbuild "main=$ENTRY" \
	--bundle \
	--format=esm \
	--splitting \
	--target=es2020 \
	--platform=browser \
	--minify \
	--sourcemap \
	--outdir=dist

cp src/index.html dist/index.html
cp src/style.css dist/style.css
cp generated/wasm/track_geometry_bg.wasm dist/wasm/
cp examples/*.btp.json examples/*.bbm dist/examples/
touch dist/.nojekyll

test -s dist/index.html
test -s dist/main.js
test -s dist/wasm/track_geometry_bg.wasm

echo "Built dist/ (GitHub Pages-ready)."
