# Brick Track Planner

Brick Track Planner is a browser-based tool for planning LEGO-compatible train layouts on NILTC tables, with fit checks across connected table sections.

The two-section example shows an inner mainline joined across the end of a BrickTracks S8
that extends from one table onto the next. Move the receiving table to see both joins open
and the uncovered track hatch on the layout.

<!-- screenshots:begin (managed by screenshot-docs) -->
<!-- screenshots:end -->

## What you can do

- Lay out 30 x 40, 40 x 40, and 40 x 60 inch NILTC tables or enter custom dimensions.
- Connect LEGO, BrickTracks, and TrixBrix track, including R104 and R120 wide curves.
- Inspect gaps, plate-height differences, and tabletop support. Move a table and its track together.
- Import BlueBrick v9 layouts and save editable `.btp.json` projects.
- Download a PDF setup sheet, PNG or WebP layout image, or track-only LDraw file.

## Quick start

Use Node.js 26 with npm 12, plus Rust, the `wasm32-unknown-unknown` target, and `wasm-pack`. On
macOS, install the Homebrew tools with `brew bundle`, then install JavaScript dependencies.

```sh
brew bundle
rustup default stable
rustup target add wasm32-unknown-unknown
npm ci --no-audit
./run_web_server.sh
```

The server builds and serves `dist/`. Open the localhost URL printed in the terminal and try
the seam check.

1. Choose **Two-section seam** from **Open an example...**. Both mainline pairs show as joined.
2. Select **Table B** in the **Tables** panel. Set **X (studs)** to `130` in the inspector and
   click **Apply**. Both pairs show a two-stud gap, and hatching marks the unsupported part of the S8.
3. Click **Undo** to restore the joins. Choose **PDF** and click **Export** for the setup sheet.
   Use **Save project** to download the editable layout.

## Examples

The starter projects are [two-section.btp.json](examples/two-section.btp.json) and
[double-corner.btp.json](examples/double-corner.btp.json), with a
[BlueBrick v9 import example](examples/bluebrick-example.bbm). The Pages build copies `examples/`
into `dist/examples/`.

## GitHub Pages workflow

The root [deploy-pages.yml](deploy-pages.yml) is the canonical workflow source. GitHub runs workflow
files from `.github/workflows/`, so copy the root file's contents into
`.github/workflows/deploy-pages.yml` in the GitHub browser and set the repository Pages source to
GitHub Actions. The workflow verifies pull requests, pushes to `main`, and manual runs; it deploys
only from `main` or a manual run on the default branch.

Install Chromium and WebKit with `npx playwright install chromium webkit` for local release checks.
On Linux, use `npx playwright install --with-deps chromium webkit` to include system dependencies.
Run `./devel/verify_release.sh` to build the Pages artifact and run the checks. For standalone
codebase checks, run the build first to generate the Wasm TypeScript declarations.

## Documentation

- [docs/GEOMETRY_MODEL.md](docs/GEOMETRY_MODEL.md)
- [docs/FILE_FORMAT.md](docs/FILE_FORMAT.md)
- [data/CATALOG_SOURCES.md](data/CATALOG_SOURCES.md)
- [docs/active_plans/active/BRICK_TRACK_PLANNER_V1.md](docs/active_plans/active/BRICK_TRACK_PLANNER_V1.md)
- [docs/active_plans/active/BRICK_TRACK_PLANNER_V1_PROGRESS.md](docs/active_plans/active/BRICK_TRACK_PLANNER_V1_PROGRESS.md)
- [docs/CHANGELOG.md](docs/CHANGELOG.md)

## License

Source code: [LICENSE.AGPL-3.0](LICENSE.AGPL-3.0).

Documentation and other non-code materials: [LICENSE.CC-BY-4.0](LICENSE.CC-BY-4.0).
