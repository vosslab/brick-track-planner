# Brick Track Planner v-final progress

The ship criteria follow [BRICK_TRACK_PLANNER_VFINAL.md](BRICK_TRACK_PLANNER_VFINAL.md).
Historical verification for the first release lives in
[BRICK_TRACK_PLANNER_V1_PROGRESS.md](BRICK_TRACK_PLANNER_V1_PROGRESS.md). The manager reproduced
that browser baseline against the staged Pages subpath with 19 passing and four intentional skips
in 5.5 seconds.

## Rules and source receipt

Applied full Ponytail mode and the repo-rules reader. Read [AGENTS.md](../../../AGENTS.md) and the
2026-11-24 entry in [CHANGELOG.md](../../CHANGELOG.md), including the requirement to stage the
four section bundles and Whole Show alongside the three original examples. Run Python with
`source source_me.sh && python3`. A fragile pytest depends on transient context or incidental
structure, such as dates, changing inventories, timing, or unseeded randomness.

Read the 12 repository style files:

- [FUN_VIBES_DESIGN_STYLE.md](../../FUN_VIBES_DESIGN_STYLE.md),
  [GITHUB_PAGES_STYLE.md](../../GITHUB_PAGES_STYLE.md), [MARKDOWN_STYLE.md](../../MARKDOWN_STYLE.md),
  [PLAYFUL_TRAINING_GAME_STYLE.md](../../PLAYFUL_TRAINING_GAME_STYLE.md),
  [PLAYWRIGHT_TEST_STYLE.md](../../PLAYWRIGHT_TEST_STYLE.md), and [PYTEST_STYLE.md](../../PYTEST_STYLE.md).
- [PYTHON_STYLE.md](../../PYTHON_STYLE.md), [REPO_STYLE.md](../../REPO_STYLE.md),
  [RUST_PYO3_STYLE.md](../../RUST_PYO3_STYLE.md), [RUST_STYLE.md](../../RUST_STYLE.md),
  [RUST_WASM_STYLE.md](../../RUST_WASM_STYLE.md), and [TYPESCRIPT_STYLE.md](../../TYPESCRIPT_STYLE.md).

## Onboarding and standards

- **Welcome (`vn_welcome`) and starters (`vn_surfaces`).** The chooser offers 40x40, 60x40
  Straight, 60x40 Curve, Advanced blank, and a separate Open existing action. Starter tests verify
  editable 32-stud plates, connected mainlines, and named exits. The straight starter footprints
  are 128x128 and 192x128 studs. The curve footprint is 192x128 studs, with two fronts.
  [test_niltc_starters.mjs](../../../tests/test_niltc_starters.mjs)
- **Connector guidance (`vn_snap`).** The native check verifies that a real rail connector wins over
  a nearby lane guide. Visible placement on a rotated table lands the two S16s at local y=8 and
  y=24 and the baseplate at (16, 16). Siding placement and duplication preserve both mainlines.
  [niltc.rs](../../../rust/niltc.rs), [niltc.spec.ts](../../../tests/playwright/niltc.spec.ts)
- **Table standards (`vn_standards`).** New starters and nominal presets carry explicit NILTC
  tags. V1 and BlueBrick imports preserve geometry and free editing with no automatic tag.
  Applying checks to imported geometry preserves its pose and reports the off-grid plate.
  NILTC table, lane, and exit findings remain separate from connector joins. The staged NILTC
  browser matrix passed 10 checks across desktop and touch Chromium.
  [test_project.mjs](../../../tests/test_project.mjs), [niltc.spec.ts](../../../tests/playwright/niltc.spec.ts)

## Geometry, appearance, and materials

- **Project and geometry.** V1 migration creates one local section and preserves geometry and
  repairable seam references. V2 round-trips tables, sections, venue, members, and appearance.
  Native and staged Wasm compare results against the same fixture. The native engine remains
  stateless. [test_project.mjs](../../../tests/test_project.mjs),
  [parity.spec.ts](../../../tests/playwright/parity.spec.ts)
- **Catalog.** 4DBrix S4 and S8 match the regular mating planes. R104 takes nine 10-degree
  segments and R120 takes ten 9-degree segments to form their respective quarter circles.
  The vendor dimensions and STL files established their geometry. The source search turned up no
  verified BlueBrick aliases or calibrated LDraw mappings for those four parts.
  [CATALOG_SOURCES.md](../../../data/CATALOG_SOURCES.md)
- **Vector scene and appearance.** Desktop and phone captures in Chromium and WebKit show the
  chooser, overview, and close track. The shared SVG renders molded baseplates, track-mounted
  ballast, and rail, tie, and stud detail at close zoom. Track colors and ballast look edit
  independently of pose, height, and opting into material counts. The overview marks the standard
  +2 plates once per NILTC table and uses one caption per visible radius and sweep pair. The
  final Chromium and WebKit captures confirm the cleaner labels and the retained height markers
  for deviations. See `/private/tmp/btp-niltc-polish-chromium.webp` and its WebKit counterpart.
  [appearance.spec.ts](../../../tests/playwright/appearance.spec.ts)
- **M5 / venue geometry (`vn_venue`).** Six focused cases cover rotated table overlap and edge
  contact, near-contact and positive overlap, venue and keepout bounds, hidden layers, and
  table and piece footprints. The input contract bounds pose coordinates to +/-100,000 studs
  and dimensions to (0, 100,000] studs. The staged venue workflow checks edits, unit conversion,
  keepout diagnostics, and undo. [tests.rs](../../../rust/evaluation/tests.rs),
  [venue.spec.ts](../../../tests/playwright/venue.spec.ts)
- **M6 / ballast source audit.** A second transcription independently checked all 25 material rows
  against the illustrated source sheets, including color and exact compatible track. The 001A,
  022A, and 023B recipes contain 44, 71, and 98 ballast pieces per track section respectively.
  Both colors of the straight's 2 x 8 plate stay distinct. The inventory retains recipe gaps.
  [BALLAST_SOURCES.md](../../../data/BALLAST_SOURCES.md),
  [test_ballast_recipes.mjs](../../../tests/test_ballast_recipes.mjs)

## Sections and whole-show proof

- **Section transforms (`vn_sections`).** Member table controls use the 32-stud grid and quarter
  turns. The arbitrary-angle venue transform moves the section rigidly and preserves local plates,
  poses, and references. [test_sections.mjs](../../../tests/test_sections.mjs)
- **Section files (`vn_section_files`).** All four staged bundles open at their anchors. The
  repeated Corner imports have fresh independent IDs. Section export preserves attached pieces,
  used layers, internal seams, and named exits. Invalid data is rejected before insertion.
  [test_sections.mjs](../../../tests/test_sections.mjs),
  [test_show_fixture.mjs](../../../tests/test_show_fixture.mjs)
- **Alignment and assembly (`vn_alignment`, `vn_assembly`).** The M7-M11 integrated fixture has
  seven independent section instances, eight tagged 128x128-stud tables, eight seams, and 16
  joined lanes within 0.000001 stud. The independent connector walk proves disjoint closed
  48-piece and 64-piece mainlines across all eight tables, with one open siding end. Moving
  Connector two studs east opens four lanes across two seams and exposes only the Yard S8 strip
  at x=288 to 290 and y=52 to 60. The last-corner preview identifies the collateral Siding /
  Southwest break while aligning both targeted lanes. [VFINAL_FIXTURE.md](VFINAL_FIXTURE.md)
- **Bring lists (`vn_sharing`).** The Whole Show fixture combines Yard and Siding under one member.
  The editor and PDF show a 22-piece LEGO S16 requirement and a one-piece shortfall when 21 are
  committed. The supplying Yard owns the spanning S8. The inventory preserves unconfirmed versus
  deliberate zero commitments, verified materials, recipe gaps, and unresolved imports.
  [test_show_inventory.mjs](../../../tests/test_show_inventory.mjs)
- **M16 / integrated acceptance.** The native oracle passed the full fixture, shifted Connector
  and last-corner scenarios. Three targeted browser checks against the staged artifact exercise
  reconstruction through visible controls, repair, member commitments, save and fresh reopen,
  touch editing of a named exit with a spanning S8, and raised rotated LDraw. Raising one plate
  changes only the LDraw Y translation by -8 LDU. [whole_show.spec.ts](../../../tests/playwright/whole_show.spec.ts)
- **Sharing matrix.** Twelve checks passed across desktop Chromium, touch Chromium, and WebKit,
  including unresolved BlueBrick save and reopen, full-layout PNG/WebP after zooming, both raster
  sizes, the area cap, and PDF output in color and grayscale. Independent rendering and text
  extraction of the 11-page grayscale packet confirmed the fronts, Yard S8 supplier, shortfall,
  and the visible and searchable Japanese member name.
  [sharing.spec.ts](../../../tests/playwright/sharing.spec.ts),
  [sharing_final.spec.ts](../../../tests/playwright/sharing_final.spec.ts)

## Performance

**M15.** Three serial repetitions used the staged Pages artifact and Chromium 159 on Apple
M5 Ultra, macOS 27.2.1. Each repetition recorded 20 samples after five warmups. Below are the
medians of the three p95 results.

| Browser profile and scene | Geometry p95 | Update through SVG layout p95 |
| --- | --- | --- |
| Desktop Chromium, 1,000 pieces | 3.00 ms | 13.70 ms |
| Touch Chromium, 300 pieces | 1.00 ms | 5.20 ms |

Both profiles met the 8 ms geometry and 16.7 ms update targets at release. The measured build had
92,615 bytes of entry JavaScript, 15,856 bytes of CSS, and 730,622 bytes of Wasm. The timing probe
was used for this release investigation and has been removed from the permanent suite.

## Local release gate

**Release verification (`vn_release`).** The local gate passed Cargo formatting, 21 Rust tests,
Clippy, the Pages build, TypeScript checks, 36 Node tests, and 46 Playwright checks in 18.6 seconds.
The seven browser skips are the two opt-in timing checks, one redundant touch parity check, one
desktop-only swap workflow, and three scenarios assigned to the opposite input profile.
The log is `/private/tmp/vf-certified.log`. Reproduce the gate with:

```sh
./devel/verify_release.sh --reporter=list,html --output=test-results/vfinal-certified
```

The independent clean-source snapshot starts from `8ef74ff` with 198 reviewed files and no
generated build inputs. Its `npm ci` reported zero vulnerabilities. It passed the full release
gate with the same counts and a browser time of 18.7 seconds. The separate suite passed 1,179
checks with `source source_me.sh && python3 -m pytest -q` in both the snapshot and the worktree.
The artifact has 28 files, including `.nojekyll`, Wasm, and all eight byte-identical source
fixtures at `/brick-track-planner/`. The independent fresh build's Wasm file is 729,862 bytes.
The scratch logs and SHA-256 manifests are under `/private/tmp/brick-vfinal-release.MMAy45/`.
The verified source manifest SHA-256 is
`219e530e6f7120c275b643f201378bcf0bc8430e33ec5b7f85fd2775a088b65f`.

The public release remains v1. This verification covers the local v-final artifact.
