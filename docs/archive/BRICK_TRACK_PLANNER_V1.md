# Plan: Brick Track Planner v1

## Context

Brick Track Planner helps Northern Illinois LEGO Train Club members check whether two table
sections connect on both mainlines, accommodate a mixed-brand siding, and produce a setup sheet
that explains table orientation and what track to bring. [NILTC standards](https://niltc.org/standards)
[NILTC tables](https://niltc.org/standards/tables)
[NILTC track specifications](https://niltc.org/standards/track-specifications)

> The project will create small test layouts to check BlueBrick import, mixed-brand track connections, table fit, parts counts, and save/reopen. Steve&rsquo;s yard and Mark&rsquo;s siding are optional club pilot layouts if they become available.

## Objectives

- Align both mainlines across two club sections and distinguish horizontal gaps, plate-height
  differences, and unsupported track.
- Build, move, and revise a mixed-brand siding. Include R104 and R120 curves and an editable club
  corner.
- Edit on phone and desktop, save and reopen native projects, and import BlueBrick layouts with
  unsupported pieces marked in place.
- Download whole-layout PDF, WebP, and PNG files and a track-only LDraw file.

## Design philosophy

TypeScript owns the committed project, undo history, and browser UI. Rust/Wasm owns geometry,
snapping, seam and footprint checks, and inventory. A stateless, batched Wasm call evaluates a
snapshot and any proposed edit. TypeScript commits an accepted edit as one transaction. Undo
restores and reevaluates the prior snapshot. Consider a disposable geometry cache only when
profiling identifies repeated work worth caching.

## Scope

### Tables, seams, and editing

- Offer NILTC presets for **30 x 40**, **40 x 40**, and **40 x 60 inches**, modeled as nominal
  **96 x 128**, **128 x 128**, and **128 x 192 studs**. Convert custom dimensions at 8 mm per stud.
  Label nominal and measured dimensions. Keep the visual 32 x 32 grid and placed baseplates
  independent. [NILTC tables](https://niltc.org/standards/tables)
  [TrixBrix stud dimensions](https://trixbrix.eu/en/beginners-guide-to-trixbrix)
- Name each table and mark its front edge. Allow a second adjacent front edge for corners. Draw
  mainline guides **8 and 24 studs inward**. Moving or rotating a section moves attached pieces.
  Reassignment preserves the piece's world pose.
  [NILTC track alignment](https://niltc.org/standards/track-specifications)
- Pair real outer and inner endpoints across a seam. An extending connector remains attached to
  the section supplying it. Its endpoint stays selectable at its actual position, including
  beyond that tabletop. Preserve intended pairs across edits and diagnose joined, misaligned,
  height mismatch, or missing endpoints. A repair action lets the member rebind an endpoint.
- Store a signed whole-plate height per track piece, with `0` at the project baseline. Preserve
  height on move, rotation, and swap. Snap compatible connectors at equal height using actual
  positions and opposed headings. Recognize existing joins within 0.05 stud and 0.25 degrees.
  Report ambiguous joins as unresolved.
- Use explicit multi-select for rigid siding moves. Preview a turnout swap around its common
  connector and identify changed joins before commit. Recheck a seam reference whose connector
  ID survives. Keep the reference as missing if the connector disappears.
- Check projected track and baseplate footprints against the union of visible tabletops. A flush
  seam can support a piece across both tables. Hatch the unsupported portion when a gap opens.
  Height is relative to the project baseline. Tabletop coverage is a plan-view check.

### Catalog and editable examples

- Ship LEGO S16, R40, and left/right points. Ship BrickTracks S4/S8, R104/R120, left/right R104
  turnouts, and distinct R104A/R104B pieces. Ship TrixBrix S8/S32, R104/R120, and verified
  left/right R104 switch assemblies. Check in normalized connectors, footprints, original
  drawings, exact import aliases, and sources.
  [BlueBrick part packages](https://bluebrick.lswproject.com/download.html)
  [BrickTracks switch kit](https://bricktracks.com/products/r104-switch-track-kits)
  [TrixBrix switch kit](https://trixbrix.eu/en/p/track/switches-and-crossovers/switches-and-crossovers-r104/right-switch-r104/9951-right-switch-r104)
- Map all four `BT SWITCH R104 {LEFT,RIGHT} STAND {INSIDE,OUTSIDE}.8` aliases to the exact handed
  turnout body and one `BT SWITCH STAND.8`, using the source stand pose. Keep the quarter-circle
  `SET R104 TURNOUT` arrangements distinct. Place Kit and import use the same verified recipes.
  Count expanded physical pieces once. Verify counts and endpoints against an equivalent
  BlueBrick fixture and list unverified assemblies as unresolved.
  [BrickTracks BlueBrick package](https://bluebrick.lswproject.com/download/package/BrickTracks.1.1.zip)
- Ship a native two-section layout, native 40 x 40 double corner, and separate authored BlueBrick
  stock-table example. The corner uses eight 11.25-degree segments per route, R120 outside and
  R104 inside, mixing both vendors in each route. On a 128-stud square with north and west fronts,
  the arcs share center `(128, 128)` and meet the east and south guides at offsets 8 and 24.
  Verify all four exits and both front marks after save/reopen.
  [NILTC corner standard](https://niltc.org/standards/track-specifications)
  [BrickTracks R104](https://bricktracks.com/products/r104-curve-x8-pf)
  [BrickTracks R120](https://bricktracks.com/products/r120-curve-x8-pf)
  [TrixBrix track catalog](https://trixbrix.eu/en/beginners-guide-to-trixbrix)

### Project files and sharing

- Save and open an editable LDraw track plan across browsers. Preserve tables, fronts, poses, plate
  heights, attachments, layer order and visibility, seam pairs, and unresolved items. Recompute
  diagnostics on open.
- Import BlueBrick v9 `.bbm`. Preview supported items and summarize skipped layer types.
  Preserve supported table, baseplate, and track layer order and visibility. Keep unsupported
  pieces at their source positions with a name or original ID. Preserve the open project on
  cancellation or invalid input. Use the `DisplayArea` center, rotation, and the verified
  origin offset. Interpret zero or missing `Altitude` as baseline. A nonzero value is absolute
  LDraw Y. The part `2865.8` has preferred Y of -8 LDU, so test source values 0 as baseline,
  -16 as one plate up, and -12 as fractional. Preserve the fractional item's source position and
  raw altitude as unresolved.
  [Official BlueBrick example](https://bluebrick.lswproject.com/download/Example.bbm)
  [BlueBrick placement](https://github.com/Lswbanban/BlueBrick/blob/master/BlueBrick/MapData/LayerBrickBrick.cs)
  [BlueBrick height handling](https://github.com/Lswbanban/BlueBrick/blob/master/BlueBrick/SaveLoad/SaveLoadManager.cs)
  [9V straight metadata](https://github.com/Lswbanban/BlueBrickParts/blob/master/parts/Track/2865.8.xml)
- Use visible items for snapping, coverage, inventory, and exports. Hidden items stay editable.
  A seam with a hidden endpoint is inactive until the endpoint is visible again.
- Export the visible layout at full bounds regardless of editor zoom. Use one SVG drawing and
  bounded-resolution canvas for PDF, WebP, and PNG. Use jsPDF for a landscape US Letter setup
  sheet with paginated inventory and the Rust `image-webp` encoder when browser encoding is
  unavailable. Identify section names, fronts, outer and inner lines, curve radii, the spanning
  S8's supplier, the dimensions used, and nonzero baseline-relative heights. Label coverage
  **plan-view tabletop support**.
  [jsPDF](https://github.com/parallax/jsPDF)
  [Canvas encoding](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
  [Rust WebP encoder](https://docs.rs/image-webp/latest/image_webp/struct.WebPEncoder.html)
- Export a flat, track-only `.ldr` of visible mapped pieces. Map planner XY to LDraw XZ at
  20 LDU per stud, apply calibrated origins and orientations, and write
  `Y = baselineY - 8 * heightPlates`. Start with verified LEGO straight, curve, and turnout
  references and L-Gauge BrickTracks R104/R120 models. Report omitted pieces and link required
  custom models.
  [LDraw units and format](https://www.ldraw.org/article/218.html)
  [LEGO track models](https://library.ldraw.org/tracker/summary/2)
  [L-Gauge models](https://l-gauge.org/wiki/index.php?title=CAD_Tools#LDraw_Components)
  [Studio import formats](https://studiohelp.bricklink.com/hc/en-us/articles/6502277722647-Import-formats)
  [Studio custom parts](https://studiohelp.bricklink.com/hc/en-us/articles/8117942037911-Missing-parts)

### Phone and desktop

Use top-down SVG with symbols and text for open ends, height differences, and overhangs.
Provide tap selection and placement, pinch zoom, collapsible panels, and reachable edit and
undo controls on phones. Share the position, rotation, and height inspector with desktop.
Desktop also gets persistent panels, box selection, and shortcuts.
[WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Non-goals

Follow-up scope includes a 3D viewport, slopes, automatic ballast, clearance checks, reusable
sections, venue planning, member bring lists, 4DBrix expansion, BlueBrick export, and LDraw import.

## Architecture boundaries and ownership

- TypeScript owns the committed snapshot, history, commands, rendering, and file handling.
  Validate proposed imports before replacing the open project.
- Rust owns deterministic geometry and analysis in one root Cargo library. Use a thin
  `wasm-bindgen` adapter, generated TypeScript declarations, and
  `wasm-pack --target web --release` for `wasm32-unknown-unknown`.
  [Rust browser target](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html)
  [Browser packaging](https://wasm-bindgen.github.io/wasm-bindgen/examples/without-a-bundler.html)
- Fix the shared contract in M3. Attached items have a `tableId` and local pose. Loose items
  have a world pose. Track heights are independent of table transforms. A seam stores two table
  edges and exactly two pairs, `outer` and `inner`, addressed by stable piece and connector IDs.
  M4 owns creating, preserving, and rebinding these references. M5 owns diagnosis and coverage.

### File scope

Use `src/` for the editor, `rust/` for the core, `data/` for reviewed catalog inputs,
`examples/` for editable layouts, and `tests/` for verification. The Pages build generates
bindings before type-checking, loads Wasm by relative URL, and packages the three examples.
Commit dependency lockfiles. Build the artifact from the reviewed source files.

## Milestone plan

Each row lists dependencies and its exit evidence.

| M | Deliverable | Dependency and exit evidence |
| --- | --- | --- |
| 1 | Real Wasm slice | Start from the template. At `/brick-track-planner/`, prove a straight join, shifted gap, commit, undo, and save from the TypeScript project. |
| 2 | Catalog and fixture IDs | Start independently. Publish IDs and connector roles early for LEGO S16, BrickTracks S8, the fixture turnout, and both vendors' standard R104/R120 curves. Finish catalog geometry, exact aliases, drawings, and recipes. Independently compare both BrickTracks stand variants as imported and placed assemblies. |
| 3 | Section contract and native examples | After M1 and M2's early IDs, publish the seam and height contract, implement table poses and attachment, and author both native examples. Verify the corner's four exits and two front marks. Give M4-M6 the same two-section fixture and expected results. |
| 4 | Editing and bindings | After M3 and relevant M2 entries, implement snap, rigid selection moves, swap preview, height edits, seam pairing, and repair. Verify the siding edit preserves all four bound connectors and a missing connector can be rebound. |
| 5 | Seam and footprint diagnosis | After M3, independently report the mainline gaps, uncovered S8 strip, and one-plate mismatch. Undo restores both joins and support. Try the table controls on a narrow viewport as soon as diagnostics work. |
| 6 | BlueBrick and project files | After M3 and the M2 aliases, author the stock `TABLE96X64` fixture with a baseplate, rotated BrickTracks turnout, unsupported item, and independent height cases. Verify ordering, visibility, placement, failed-import recovery, and native save/reopen. |
| 7 | Touch and desktop workflow | After M4-M6, create and repair the S8 pair through visible touch controls, including the endpoint beyond the supplying table. Rotate and correct the receiving table through the shared inspector. Repeat the core workflow on desktop. |
| 8 | Image downloads | After M5, decode PNG and WebP downloads from a zoomed-in view, verify the full layout, and exercise the WebP fallback in WebKit. |
| 9 | PDF setup sheet | After M8, check PDF labels and inventory. An independent agent reads the grayscale sheet to identify both fronts, the spanning connector's supplier, and pieces needed. |
| 10 | LDraw handoff | After M2-M3, export a mapped turnout joined to a straight at baseline and a wide curve. Independently check rail endpoints and branch handedness. Raise the turnout one plate and assert -8 LDU in Y with unchanged X, Z, and rotation. Check reports. Studio is an additional cross-check where available. |
| 11 | Clean-checkout release | After M7-M10, package the three examples. An independent agent runs the full release check from a clean checkout. The manager dispatches fixes and reruns failures. |

`Parallel-plan ready: yes`. M1 and M2 start independently. The early M2 ID handoff releases M3
without waiting for the full catalog. M4-M6 use M3's shared fixture and ready M2 entries.

## Test and verification strategy

**Show demo.** Open the native 30 x 40 and 40 x 40 example. Rotate the sections into position,
mark fronts, and verify both mainlines. One join sits at the seam. The other sits at the end of
a BrickTracks S8 attached to the supplying section that extends onto its neighbor. Add a
mixed-brand siding with the shared endpoints fixed. Shift the receiving section two studs along
the rails. Both pairs show two-stud gaps and the uncovered S8 strip hatches. Undo and compare
the restored inventory with the hand count.

**File and export demo.** Import the authored BlueBrick fixture and verify the rotated turnout
and unresolved piece, then save and reopen in a fresh browser context. Export PDF, WebP, and PNG
from a zoomed-in view and verify format and framing. Test baseline and raised LDraw exports
against independent rail endpoint coordinates and orientation.

Run Cargo format, tests, and Clippy, the repository TypeScript checks, and Playwright against the
complete artifact staged at `/brick-track-planner/`. Compare native and browser Wasm fixture
outcomes exactly and coordinates within `1e-6` stud. Use desktop Chromium and touch Chromium and
WebKit. Record artifact size and timing for 1,000-piece desktop and 300-piece narrow-view scenes.
Use 8 ms geometry and 16.7 ms update-to-draw p95 as diagnostic targets for visible lag.

## Rollout and release checklist

- Provide one verification command and CI job that build and stage `dist/`, exercise the demos,
  and retain the PDF, image, and CAD evidence.
- Use the root [deploy-pages.yml](../../deploy-pages.yml) as the canonical workflow source.
  To activate Pages, copy it to `.github/workflows/deploy-pages.yml` and select GitHub Actions
  as the Pages source. Artifact verification runs independently of publication.
- Close on a verified Pages-ready artifact using published references, authored fixtures, and
  automated checks.

## Documentation close-out requirements

Document catalog provenance, visibility, height and seam semantics, supported import and export
coverage, and the acceptance demo. Record the club acceptance note and settled decisions in the
repository guidance. Update the README and changelog. Record implementation evidence and review
in [BRICK_TRACK_PLANNER_V1_PROGRESS.md](BRICK_TRACK_PLANNER_V1_PROGRESS.md).
