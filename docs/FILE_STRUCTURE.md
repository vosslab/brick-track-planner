# File structure

## Top-level layout

```text
data/       Track catalog, ballast recipes, and source records
devel/      Build, release, and repository-maintenance scripts
docs/       User, format, geometry, architecture, and reference documentation
examples/   Editable member design examples
rust/       Rust/Wasm geometry evaluator
src/        Browser editor and export implementation
tests/      Node, Python policy, and Playwright tests
```

`README.md` introduces the member workflow. `package.json` defines the
TypeScript tooling. `Cargo.toml` defines the Rust/Wasm crate.

## Key source areas

- [`../src/project.ts`](../src/project.ts) owns the validated version 3 file
  contract.
- [`../src/main.ts`](../src/main.ts) owns browser startup and editor control
  flow.
- [`../src/scene.ts`](../src/scene.ts) renders the one design area and placed
  track. [`../src/scene_drawing.ts`](../src/scene_drawing.ts) contains shared
  SVG geometry helpers.
- [`../src/arrangements.ts`](../src/arrangements.ts) and its focused modules
  describe complete practical track plans.
- [`../src/project_files.ts`](../src/project_files.ts) imports BlueBrick maps.
  [`../src/share_pdf.ts`](../src/share_pdf.ts) and
  [`../src/ldraw.ts`](../src/ldraw.ts) export member designs.
- [`../rust/model.rs`](../rust/model.rs), [`../rust/ports.rs`](../rust/ports.rs),
  [`../rust/routes.rs`](../rust/routes.rs), [`../rust/coverage.rs`](../rust/coverage.rs),
  and [`../rust/niltc.rs`](../rust/niltc.rs) evaluate the project model.

## Documentation map

- [`FILE_FORMAT.md`](FILE_FORMAT.md) documents the persisted project contract.
- [`GEOMETRY_MODEL.md`](GEOMETRY_MODEL.md) documents coordinates, routes, and
  track constraints.
- [`USAGE.md`](USAGE.md) describes the member workflow.
- [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) records settled design choices.
- [`HUMAN_GUIDANCE.md`](HUMAN_GUIDANCE.md) records user direction.
- `docs/references/` contains local source snapshots used by the planner.

## Generated artifacts

`generated/wasm/` contains generated Wasm bindings. `dist/` contains the
staged Pages build. `target/`, `playwright-report/`, and `test-results/` hold
local build and test output. These paths are ignored by Git.

## Where to add work

- Add user-facing editor behavior under [`../src`](../src) with a focused
  Node or Playwright test under [`../tests`](../tests).
- Add track data under [`../data`](../data) with source evidence.
- Add geometry evaluation in [`../rust`](../rust) and exercise it through the
  browser engine path.
- Update the closest user or technical document in [`docs`](.) and record
  notable changes in [`CHANGELOG.md`](CHANGELOG.md).
