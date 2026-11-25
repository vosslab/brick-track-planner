# Brick Track Planner v-final progress

The ship criteria and assignments follow
[BRICK_TRACK_PLANNER_VFINAL.md](BRICK_TRACK_PLANNER_VFINAL.md). Baseline evidence belongs to
[BRICK_TRACK_PLANNER_V1_PROGRESS.md](BRICK_TRACK_PLANNER_V1_PROGRESS.md). The v-final checks
start from that baseline and have their own implementation and review evidence.

## Dispatch and evidence

Rows name the active owner. Each completion entry records the exact check and result. Milestones
have technical checks, with no human approval gates.

- **Welcome flow** (`vn_welcome`) - Underway; exercise all four starters and separate Open
  existing action.
- **Starter surfaces** (`vn_surfaces`) - Underway; check editable 32-grid plates, lane offsets,
  and the curve footprint.
- **Connector-guided placement** (`vn_snap`) - Underway; prove actual connector snaps take
  priority over nearby guides.
- **Table standards** (`vn_standards`) - Underway; check v1/BBM import geometry and editing remain
  intact, new v2 starters are tagged, off-grid diagnostics do not move tables, and lane/exit
  checks remain separate from joins.
- **Section transforms** (`vn_sections`) - Underway; check quarter-turn/grid member tables and
  arbitrary rigid venue turns.
- **Section files** (`vn_section_files`) - Underway; check independent copies and safe failure on
  invalid input.
- **Venue and alignment** (`vn_venue`, `vn_alignment`) - Underway; check fit findings, both lane
  exits, and collateral breaks.
- **Bring lists and exports** (`vn_sharing`) - Underway; check quantities, supplier-grouped
  omissions, full-layout exports, and setup packet content.
- **Whole-show acceptance** (`vn_assembly`) - Underway; assemble reusable sections and exercise
  repair, save/reopen, and sharing.
- **Release evidence** (`vn_release`) - Underway; record local artifact checks. Live-site
  publication remains a separate manual action.

## Skills and implementation snapshot

- Skills receipt: applied the requested full ponytail mode and the repository's Markdown and
  changelog conventions. The milestone checks remain technical; no human gate is added.
- The current source contains a v2 project type, validates v1/v2 input, migrates v1 on open, and
  emits version 2. See [`project.ts`](../../../src/project.ts). This confirms the v2 snapshot in
  source; it is not a claim that every v2 feature or this updated plan has passed release checks.
- The Pages workflow keeps local artifact verification separate from the live site's manual
  publication.

## Initial evidence

- The manager reproduced the v1 browser baseline at the Pages subpath in 5.5 seconds with
  the staged v1 artifact.

  ```sh
  env -u NO_COLOR PLAYWRIGHT_HTML_OPEN=never ./run_playwright_tests.sh --reporter=list \
    --output=test-results/vfinal-baseline --grep-invert "venue|whole show|high resolution"
  ```

- The 4DBrix source check found no exact BlueBrick import alias or LDraw model for the four
  launch parts. The vendor publishes STL geometry for these parts. The editor keeps unresolved
  imports and LDraw omission reporting for pieces without verified mappings.
- The early native oracle joined all 16 fixture lanes within 0.000001 stud. Moving Connector
  two studs opens the two named north joins on both lanes and exposes only the Yard S8 strip.
  The fixture also establishes the last-corner collateral break for the alignment preview.
  [VFINAL_FIXTURE.md](VFINAL_FIXTURE.md)

## Shared decisions

- V2 is the live project shape; source currently migrates v1 on open and emits v2. Rust evaluates
  geometry statelessly. Section import creates copies in that same model.
- Member nominal tables use quarter turns and 32-stud grid placement. Their baseplates stay
  table-local; the venue coordinator applies a rigid arbitrary-angle transform to a whole section.
- Starter baseplates expose an editable 32-grid. NILTC starters prelay lane guides at local offsets
  8 and 24; curve starters have a 192x128 footprint.
- V1 and BlueBrick imports preserve geometry and editing without automatic table tags or movement.
  New v2 starters and presets carry explicit nominal tags. NILTC checks can diagnose off-grid
  tables without moving them and guide future edits.
- Standards findings name lanes and exits and remain separate from ordinary connector joins.
- The exact 001A straight recipe contains 44 verified materials; the sharing check covers
  supplier-grouped omitted exports and custom-model links.
- Section bundles carry local table poses, attached
  items, used layers, internal seams, and named exits. The show carries external joins and
  bring commitments. Import must remap every included reference before inserting it.
- The assembly fixture verifies nominal 128-stud table coordinates and both closed routes. The
  alignment preview names collateral breaks.
- Compatibility and material data remain source-backed. The inspector and inventory distinguish
  appearance, material quantities, missing recipes, and explicit height.
- The v1 benchmark reported 2.90 ms p95 geometry and 28.90 ms p95 SVG redraw at 1,000 pieces.
  These historical values do not establish current performance.
- The root Pages workflow stays canonical. Record exact technical checks and artifact snapshots.
  Live-site publication is a separate manual action; club participation and proprietary CAD access
  are independent.
