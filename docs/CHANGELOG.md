# Changelog

## 2026-11-24

### Additions and new features

- Added a welcome chooser with 40 x 40, 60 x 40 Straight, 60 x 40 Curve, and Advanced starters.
  NILTC starters have editable 32-stud baseplates, two connected mainlines, and named exits.
- Added version 2 show projects, reusable `.btps.json` section bundles, named dual-lane alignment,
  measured venue and keepout checks, and member bring lists with commitments and shortfalls.
- Added explicit NILTC table adoption with separate table, lane, and exit findings. Legacy and
  BlueBrick imports retain their geometry and free editing until the user adopts the standard.
- Added a source-backed LEGO, BrickTracks, and TrixBrix catalog, including TrixBrix S8/S32 and its
  one-section R120 placement unit (two printed pieces per section). Added 4DBrix S4, S8, R104, and
  R120 with verified dimensions and 10- and 9-degree curve sweeps.
- Added reusable SVG rails, molded baseplates, and visual ballast. Close detail starts at three
  CSS pixels per stud. Added opt-in ballast recipes for compatible 001A, 022A, and 023B track, with
  44, 71, and 98 ballast pieces per track section respectively.
- Marked each audience-facing table edge with three SVG chevrons and a close-detail label in the
  shared starter, editor, and export renderer.
- Marked NILTC tables show the standard +2-plate height once. Track height changes remain
  marked, and each visible radius and sweep combination has a single overview caption.
- Added full-layout PNG and WebP in Standard (2,400 px) and High (4,096 px), with a 12-megapixel cap,
  plus color and grayscale PDF setup packets with table placement, joins, and paginated bring lists.
- Added LDraw export for mapped track poses and plate offsets, with links for required custom
  models. The report keeps same-name track omissions distinct by supplier and lists unresolved
  items. Tables, baseplates, scenery, and ballast are outside the model.
- Updated [FILE_FORMAT.md](FILE_FORMAT.md) and [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md), and added a
  local Whole Show walkthrough in [USAGE.md](USAGE.md).
- Added a prominent live GitHub Pages link to the README, a local Whole Show quick start, and
  screenshots of the current checkout's starter chooser and assembled show.
- Added a first-action siding on the two straight starters. It adds a LEGO turnout and curve
  and a TrixBrix straight in one undoable edit, preserving both mainline exits.

### Behavior or interface changes

- Updated the welcome cards with plain-language starter choices and made Rotate available in
  the canvas toolbar for placements and selections.
- The Pages build now locks npm dependencies, builds the Wasm module and TypeScript declarations,
  and stages Wasm and examples in `dist/`.
- The Pages build requires and stages all four section projects, the assembled Whole Show project,
  and the three original examples.
- Added `./devel/verify_release.sh` for local release checks. The canonical Pages workflow verifies
  pull requests, pushes to `main`, and manual runs. Deployment runs on `main` and on manual dispatch
  from the default branch.
- Documented the GitHub setup: copy root `deploy-pages.yml` to
  `.github/workflows/deploy-pages.yml` through the GitHub browser and set Pages source to GitHub
  Actions.
- Validate files before opening them and preserve the current layout when import fails or is
  canceled. The geometry reference documents the +/-100,000-stud pose bound, object dimensions,
  turnout swaps, and joined, open, and ambiguous endpoint symbols.

### Developer tests and notes

- Recorded local release evidence in
  [BRICK_TRACK_PLANNER_VFINAL_PROGRESS.md](active_plans/active/BRICK_TRACK_PLANNER_VFINAL_PROGRESS.md).
- Run `./build_github_pages.sh` before the first standalone `./check_codebase.sh` to generate Wasm
  TypeScript declarations.
- Moved the Playwright Pages server into a Python helper invoked through `source_me.sh`. Its
  64-connection request queue serves parallel browser requests for the staged release.
- Initial `npm ci`, npm audit, and package policy checks passed. npm audit reported no known
  vulnerabilities.
- Install Chromium and WebKit with `npx playwright install chromium webkit`. On Linux, add
  `--with-deps` to install browser system dependencies.
