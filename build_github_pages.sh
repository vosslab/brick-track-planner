#!/usr/bin/env bash
# Canonical GitHub Pages build. Run as ./build_github_pages.sh.
# Builds locked Wasm and checked TypeScript into ESM dist/; never single-file.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ENTRY="src/main.ts"
stylesheets=(src/controls.css src/style.css src/planner_build.css src/track_part_picker.css)

# Verify required static assets before any destructive step.
for required in "$ENTRY" src/index.html "${stylesheets[@]}"; do
	if [ ! -f "$required" ]; then
		echo "ERROR: required source file missing: $required" >&2
		exit 1
	fi
done
required_templates=(
	templates/member-straight.ldr
	templates/member-corner.ldr
)
while IFS= read -r template; do
	required_templates+=("templates/$template")
done < <(
	node -e 'for (const template of require("./data/track_examples.json")) console.log(template.file)'
)
for template in "${required_templates[@]}"; do
	if [ ! -s "$template" ]; then
		echo "ERROR: required release template is missing or empty: $template" >&2
		exit 1
	fi
done
if [ ! -s examples/bluebrick-example.bbm ]; then
	echo "ERROR: required BlueBrick import example is missing or empty." >&2
	exit 1
fi
required_reference="docs/references/niltc-track-specifications/index.html"
if [ ! -s "$required_reference" ]; then
	echo "ERROR: required offline NILTC reference is missing or empty: $required_reference" >&2
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
mkdir -p dist/wasm dist/templates dist/examples dist/references

./node_modules/.bin/esbuild "main=$ENTRY" \
	--bundle \
	--format=esm \
	--splitting \
	--target=es2020 \
	--platform=browser \
	--minify \
	--sourcemap \
	--outdir=dist

cp src/index.html "${stylesheets[@]}" dist/
cp -R assets/fonts dist/fonts
cp generated/wasm/track_geometry_bg.wasm dist/wasm/
cp "${required_templates[@]}" dist/templates/
cp examples/bluebrick-example.bbm dist/examples/
cp -R docs/references/niltc-track-specifications dist/references/
touch dist/.nojekyll

test -s dist/index.html
for stylesheet in "${stylesheets[@]}"; do
	test -s "dist/${stylesheet##*/}"
done
test -s dist/main.js
test -s dist/wasm/track_geometry_bg.wasm
for template in "${required_templates[@]}"; do
	test -s "dist/$template"
done
test -s dist/examples/bluebrick-example.bbm
test -s dist/references/niltc-track-specifications/index.html

echo "Built dist/ (GitHub Pages-ready)."
