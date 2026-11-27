#!/usr/bin/env bash
# Canonical GitHub Pages build. Run as ./build_github_pages.sh.
# Builds locked Wasm and checked TypeScript into ESM dist/; never single-file.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ENTRY="src/main.ts"
stylesheets=(src/controls.css src/style.css src/planner_build.css src/track_part_picker.css)

required_templates=(
	templates/member-straight.ldr
	templates/member-corner.ldr
)
while IFS= read -r template; do
	required_templates+=("templates/$template")
done < <(
	node -e 'for (const template of require("./data/track_examples.json")) console.log(template.file)'
)
# Check inputs before replacing the existing build.
required_reference="docs/references/niltc-track-specifications/index.html"
for file in "$ENTRY" src/index.html "${stylesheets[@]}" "${required_templates[@]}" \
	examples/bluebrick-example.bbm "$required_reference"; do
	if [ ! -s "$file" ]; then
		echo "ERROR: required release file is missing or empty: $file" >&2
		exit 1
	fi
done

if ! command -v wasm-pack >/dev/null 2>&1; then
	echo "ERROR: wasm-pack not found on PATH. Install wasm-pack before building." >&2
	exit 1
fi
wasm-pack build . --target web --release --out-dir generated/wasm --out-name track_geometry -- --locked
test -s generated/wasm/track_geometry_bg.wasm

./node_modules/.bin/tsc --noEmit -p tsconfig.json

release_inputs=(
	generated/wasm/track_geometry_bg.wasm
	"${required_templates[@]}"
)
release_id="$(node -e '
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const hash = createHash("sha256");
for (const file of process.argv.slice(1)) {
  hash.update(file);
  hash.update(readFileSync(file));
}
process.stdout.write(hash.digest("hex").slice(0, 16));
' "${release_inputs[@]}")"

rm -rf dist
mkdir -p "dist/assets/$release_id/wasm" "dist/assets/$release_id/templates" dist/examples dist/references

./node_modules/.bin/esbuild "main=$ENTRY" \
	--bundle \
	--format=esm \
	--splitting \
	--target=es2020 \
	--platform=browser \
	--minify \
	--sourcemap \
	--entry-names='[name]-[hash]' \
	--define:BRICK_TRACK_RELEASE="\"$release_id\"" \
	--outdir=dist

cp src/index.html "${stylesheets[@]}" dist/
cp -R assets/fonts dist/fonts
cp generated/wasm/track_geometry_bg.wasm "dist/assets/$release_id/wasm/"
cp "${required_templates[@]}" "dist/assets/$release_id/templates/"
cp examples/bluebrick-example.bbm dist/examples/
cp -R docs/references/niltc-track-specifications dist/references/
touch dist/.nojekyll

entries=(dist/main-*.js)
entry_file="${entries[0]}"
test -s "$entry_file"
node -e '
const { readFileSync, writeFileSync } = require("node:fs");
const [page, entry] = process.argv.slice(1);
const html = readFileSync(page, "utf8");
const updated = html.replace("./main.js", `./${entry}`);
if (updated === html) throw new Error("main script reference was not found in index.html");
writeFileSync(page, updated);
' dist/index.html "${entry_file##*/}"

echo "Built dist/ (GitHub Pages-ready)."
