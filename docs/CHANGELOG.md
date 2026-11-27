# Changelog

## 2026-11-26

### Additions and New Features

- Add Joel's Rockford-inspired 10-to-0 mainline as an editable template and
  screenshot. Two S-bends shift the mainlines 10 inches on a standard 60 by 40
  inch table.
- Edit the design-area outline in place. Extend or trim full NILTC edges in
  10-inch steps, or shift a span in 5-inch steps so its two edges move together.
  Preview track overhang and handoff changes. Save the outline with the layout.

- Keep multiple layouts in named tabs above one drawing, each with its own
  edits, history, and view. Open designs, examples, templates, and imports in
  new tabs. Duplicate a plan with its unsaved edits to compare variants.
- Copy selected track or a complete arrangement between layout tabs with
  visible Copy and Paste buttons or keyboard shortcuts. Preserve internal
  joints and make each placed copy independent of its source.

### Behavior or Interface Changes

- Trim the R104 semicircle return to 130 by 70 inches. Give the R120 corner
  return a 120 by 90 inch footprint with a 30 by 30 inch cutout.

- Use Atkinson Hyperlegible Next for the planner and PDF exports,
  Atkinson Hyperlegible Mono for aligned numbers, and IBM Plex Sans
  Condensed for narrow route labels.
- Treat the design-area border as a guide for placed track. Track can extend
  past it or continue through a named handoff without a placement warning.
- Delete several selected pieces in one edit. Use Command-click on Mac or
  Ctrl-click elsewhere to toggle pieces, and drag with that key held to
  select everything inside the box.
- Export PDFs in color with a single PDF option.
- Let ordinary track drops finish even with overlaps, track outside the area,
  or facing rail ends at different heights. Flag the affected track and report
  the problem until it is fixed or removed, including after save/reopen.
  Check modeled overlap for ordinary straight and curved track.
- Save and close the active layout. Ask before discarding unsaved changes
  on close, and return to setup when the last layout closes. Switching tabs
  cancels unfinished previews and keeps the copied selection available.
- Place pasted, duplicated, or explicitly moved track with one click or tap.
  Also hold track with a mouse or one finger, drag, and release to put it down.
  Keep camera gestures and undo the placement as one edit.
- Place an entire catalog siding with one click or tap when no connected fit
  is available. Keep connected-fit recommendations valid for rail height.

### Fixes and Maintenance

- Refresh the full screenshot collection and capture the paired 5-inch table
  shift in the documentation screenshot harness.

- Lead the README with an editable example and a first siding walkthrough.
  Refresh the screenshot collection and show how to compare two layout tabs.
- Use the same 0.05-stud design-edge tolerance for fit checks and placement
  warnings so flush track with tiny offsets stays clear.
- Use native image decoding for layout exports and a dialog form for the
  example gallery's Close button.
- Use the browser's structured clone when resizing a design.
- Record the place-and-flag follow-on plan and replace valid-only drop
  instructions with the drop-and-repair workflow. Keep focused permanent
  behavior checks; use broad example, geometry, and gesture scans as one-time
  implementation evidence.
- Keep a delayed template in the background while editing a Design area.
- Document copying between yards, comparing variants, per-layout saves, and
  the session lifetime of tabs and copied track. Correct the gallery's old
  replacement instructions and the README's single-layout description.
- Plan layout tabs for copying track between open yards and comparing an
  edited variant with its original. Record the close behavior and priorities.
- Build and upload the site in GitHub Actions. Run the critical release checks,
  including Playwright, locally. Push only after all local checks pass.
- Target the canvas directly in touch editing tests and verify the saved copy
  against its preview at 1-stud resolution.
- Remove the subpixel screenshot matrix and run the touch browser suite on
  member editor flows.
- Synchronized shared style guides, tests, and repository support files from the starter template.
- Synchronized shared style guides, tests, and repository support files from the starter template.
## 2026-11-25

### Behavior or Interface Changes

- Drag track directly with a mouse, or choose Move and preview a destination
  on touch. Move selected pieces and installed arrangements as a unit.
- Snap moves to compatible rail ends or shift in 8-stud steps. Offer 1-stud
  placement, quarter-turn rotation, and duplication beside the drawing.
- Fill a straight gap between open rail ends with catalog parts. Preview the
  parts and validate both joints before placing the run as one undoable edit.
- Copy and paste selected track with Command+C and Command+V on macOS or Ctrl+C
  and Ctrl+V elsewhere. Place each copy in the drawing as an undoable edit.
- Add 8TRY, a 60 by 40 inch yard with two four-track ladders and a shared
  return from the rear tracks to the front tracks.
- Rework 8TRY as eight full-width tracks. Six 45-degree crossings carry
  the row 8 to row 1 transfer between two R40 turnouts.
- Connect every adjacent pair of rows in 8TRY with alternating left- and
  right-hand R40 single crossovers. Refresh the yard and gallery screenshots.
- Name the two turnaround templates R104 semicircle return and R120 corner return.
- Replace U-shaped staging with two editable turnarounds based on the
  Downers Grove and Aurora show plans.
- Show mirrored drawings beside the two curve choices. Add the R40
  pass-through and both T-junctions as editable examples with screenshots.
- Give DTS60 80 straight studs of storage and run the layout across the
  60-inch frontage with short leads at each end.
- Start straight designs along the top plexiglass edge and offer top-left
  and top-right curves at the entered width and depth. Rotate the view in
  quarter turns without changing the track plan.
- Add the TrixBrix R40 right pass-through crossover, R40 T-junction, and
  R40-R56 T-junction to the arrangement picker with measured fit requirements.
- Add five editable 40 by 40 inch straight examples. Lead with the 60 by
  40 inch collection and use that size in the setup and siding walkthrough.
- Center Delete selected track over the drawing. Keep the Add track mode
  buttons evenly inset when the sidebar scrolls, and refresh the editor screenshots.
- Connect both west mainlines to the paired perpendicular freight spurs
  and the three storage tracks in the four-track right yard. Refresh the gallery image.
- Give the six straight gallery examples type codes such as `4TRY`. Use the
  short right-side spur to demonstrate perpendicular storage and retire the
  long spur, rear parking, and two-track arrival gallery examples.
- Refresh all five documentation screenshots. Balance the Add track panel
  insets and keep Arrangement and Single piece labels on one line.
- Set seven straight examples to 60 inches along the track by 40 inches deep
  and show dimensions on each card. Keep the long freight spur and two-track
  arrival siding deeper. Retire the diagonal spur and three-track parking yard.
  Put Back-out siding after Mainline only and label the cards with selectable names.
- Number the straight examples and sort after the mainline baseline by track
  piece count. Frame the track in each preview. Consolidate duplicate
  sidings, move perpendicular tracks to the right, and fill the four-track
  right yard to the display edge.
- Draw six LEGO and BrickTracks pieces from their LDraw models. Show open
  sleepers on other rail pieces and simplify track when zoomed out.
- Add shorter gallery versions of the diagonal and perpendicular spurs,
  back-out siding, two-track arrival siding, and three-track parking yard.
- Show each arrangement's track footprint and connection requirements. When a
  preview cannot fit, explain what blocked it and where to adjust the plan.
- Drag selected track or enter its position in the inspector. Delete selected
  track from the canvas toolbar. The baseplate grid stays visible.

### Fixes and Maintenance

- Allow the HTML-to-PDF command's error and success output in the local lint configuration.
- Keep parts quantities on one line when the part name wraps in the inspector.
- Match the R40 left turnout footprint to its mirrored right counterpart
  so the measured left ladder fits.
- Refresh the README around the first siding build and current examples.
- Archive the completed v1 and v-final plans, progress notes, and fixture.
- Fix the rotate control's HTML encoding, remove an unused camera helper,
  and complete the top-edge decision record.
- Remove duplicate geometry, template, and browser checks while keeping route,
  layout fit, and screenshot alignment coverage.
- Refresh the layout screenshots and capture the two curve options in the
  Playwright alignment checks.
- Capture full editor screenshots for every bundled layout, show the blank
  and mainline starters, and demonstrate single-piece placement in a short
  animated WebP.
- Check control alignment to a quarter CSS pixel across four viewport sizes
  and save Playwright screenshots and measurements in the browser evidence.
- Align the Add track and inspector controls and contain placement dropdowns
  inside their sections on desktop and mobile.
- Cleared lint warnings in the HTML-to-PDF command and the parts inventory
  tests. The command reports validation errors on stderr and success on stdout.
- Added a visual gallery of twelve editable straight layouts for a 40 by 60
  inch assignment, from a bare double mainline to private parking yards.
- Matched sleeper spacing across the editor and schematic LDraw parts. Yard
  switches now export with sleepers and raised rails. At normal editor zoom,
  track sleepers remain visible and ordinary joint markers recede.
- Extended the member R104 yard's three storage tracks to 128 studs while
  retaining a 16-stud clearance inside its 100 by 60 inch display area.
- Open directly on the member's assigned-area form. A straight or corner plan
  opens with a parking siding ready to preview, and a general plan offers to
  place the first track piece. Members can also open a template or saved plan.
- Fit siding storage to the available straight run and show its length before
  adding it. Single-piece placement offers the siding's open end and preserves
  the club handoffs.
- Fixed clipped track controls at laptop widths and aligned the styling of
  buttons, dropdowns, and keyboard focus across the setup form and editor.
- Replaced the native JSON download and separate LDraw export with one editable
  LDraw track plan. The straight, corner, yard, and U-shaped staging templates
  use the same file format as member designs.
- Corrected the LDraw straight and R40 curve references to the plastic LEGO
  track parts. Plans embed the L-Gauge R104 and R120 models when used, draw
  rails for other catalog track, and show the footprint of switch stands.
- Updated the README and usage guide with a 40 by 60 inch parking-siding
  walkthrough and screenshots of setup, preview, and the connected siding.
- Repaired links to retired fixtures in the historical plans and encoded the
  saved NILTC article's inch mark and trademark symbol as HTML entities.
- Simplified route tracing to track each rail endpoint and its incoming connection
  type directly. Replaced constant-only assertions with checks of the NILTC
  spacing diagnostics at 16 studs and at 64 studs after an S-curve.
- Reworked the opening screen around the assigned display area, with visible
  template and saved-plan paths, and kept the editor closed until a plan exists.
- Synchronized shared style guides, tests, and repository support files from the starter template.
## 2026-11-24

### Additions and new features

- Rebuilt the planner around one member design area with derived baseplate
  coverage, named NILTC boundary exits, and direct area-local track positions.
- Rendered that coverage as a scalable tiled baseplate surface instead of
  individually editable baseplate items.
- Removed the final per-baseplate drawing and color-choice infrastructure and
  the table-era identity pose helpers.
- Added [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md) and
  [FILE_STRUCTURE.md](FILE_STRUCTURE.md) for the current single-area design.
- Export switch stands and other catalog accessories as footprint schematics
  when their physical catalog entry has no rail centerline.
- Simplified camera interaction to pan, zoom, fit view, and tap selection;
  canvas drags no longer move layout surfaces or track accidentally.
- Added practical measured track arrangements for parking, double crossovers,
  triple switches, wyes, and three- and four-track yards. The catalog records
  physical parts and valid rail routes for each arrangement.
- Added a double-ended four-track drive-through yard: opposite-handed R40
  ladders join every storage track at both ends. Added a measured two-way R104
  turnback wye with mirrored turnouts, R104Y adapters, tail lead, and a
  two-direction mainline closure.
- Added candidate-location previews for triple switches and other arrangements,
  so a member can apply an aligned fit instead of placing geometry by hand.
- Added route tracing from a selected yard or siding track to the mainline and
  mainline checks for R104/R120 curves, height, exits, and event spacing.
- Corrected NILTC event spacing to the source dimensions: 16 studs between
  events and 64 studs after an S-curve.
- Replaced the pre-production version 2 show format with version 3. The planner
  no longer stores whole-show sections, tables, venue setup, seams, member
  commitments, or movable baseplates.
- Saved an offline NILTC track-specifications snapshot and both standard diagrams under
  `docs/references/niltc-track-specifications/`. Added L-Gauge right-switch and return-curve
  substrate references for RC builds.
- Added the genuine LEGO RC/PF R40 right-switch return arrangement and bound L-Gauge 016A and
  017A only to that arrangement; third-party switch arrangements do not receive those instructions.
- Added a welcome chooser with 40 x 40, 60 x 40 Straight, 60 x 40 Curve, and Advanced starters.
  NILTC starters have editable 32-stud baseplates, two connected mainlines, and named exits.
- Added a selectable general U-shaped staging example with plastic-track curves,
  two open mainline ends, and a connected staging siding.
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
- Marked audience-facing table edges with SVG chevrons and labeled them at overview scale on
  single-table scenes.
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
- Added a LEGO R40 rear parking siding: seven successive return curves lead behind a 60 x 40
  display to a terminal storage track while leaving the mainline direct.

### Behavior or interface changes

- Removed the 9V-only PennLUG straight ballast recipe.
- Two-finger scrolling pans the tabletop, pinch zoom follows the pointer, and Space-drag pans
  across pieces without moving them.
- Updated the welcome cards with plain-language starter choices and made Rotate available in
  the canvas toolbar for placements and selections.
- Seam diagnostics identify the lane with differing rail heights and show the difference in plates.
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

- Corrected the R40 triple-switch inventory to its six published elements while
  retaining BlueBrick's measured body geometry and three selectable routes.
- Calibrated the TrixBrix R104 four-track right yard from its measured source
  assembly. Its regression now verifies the entrance reaches each of the four
  16-stud-spaced parking exits through actual rail joints.
- Removed the release timing probe, SVG node identity checks, and redundant export downloads and
  coordinate tests. Kept the native-to-browser Wasm comparison and end-to-end editing and export
  coverage.
- Recorded local release evidence in
  [BRICK_TRACK_PLANNER_VFINAL_PROGRESS.md](archive/BRICK_TRACK_PLANNER_VFINAL_PROGRESS.md).
- Run `./build_github_pages.sh` before the first standalone `./check_codebase.sh` to generate Wasm
  TypeScript declarations.
- Moved the Playwright Pages server into a Python helper invoked through `source_me.sh`. Its
  64-connection request queue serves parallel browser requests for the staged release.
- Initial `npm ci`, npm audit, and package policy checks passed. npm audit reported no known
  vulnerabilities.
- Install Chromium and WebKit with `npx playwright install chromium webkit`. On Linux, add
  `--with-deps` to install browser system dependencies.
