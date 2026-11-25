# Brick Track Planner v-final

## Finish line

The welcome screen asks &ldquo;What are you designing?&rdquo; and offers 40x40, 60x40 Straight,
60x40 Curve, and Advanced. Open existing is a separate action. Members can design and share
reusable yards, sidings, and corners. A coordinator can assemble those sections on a venue plan,
align both mainlines, resolve missing joins and pieces, and print a setup packet that tells
members where their tables go and what to bring.

TypeScript owns editing, undo, and documents. Stateless Rust/Wasm evaluates connector geometry,
snapping, tabletop support, and venue fit. The view stays top-down with whole-plate height offsets.
The root [deploy-pages.yml](../../../deploy-pages.yml) stays the canonical workflow for manual
GitHub entry. Completion means a verified local Pages artifact at `/brick-track-planner/`.
Hosted publishing is independent of implementation and acceptance.

## Startup and geometry

- Starter layouts use editable 32-grid baseplates. NILTC starters place the two front lanes at
  table-local offsets 8 and 24. Curve tables use a 128x128 central area with a 64-stud tangent
  extending the footprint to 192x128.
- The first loose piece guides to a real snap using its actual connector geometry. Rust evaluates
  candidate poses and preserves the existing priority for true rail connectors. The lane guides
  are hints, not substitutes for connector snapping.
- Member nominal tables support quarter-turn rotation and 32-stud grid placement. Baseplates stay
  table-local. The venue coordinator can rigidly rotate a whole section by any angle.
- V1 and BlueBrick imports preserve their geometry and remain freely editable. Do not auto-tag or
  shift imported tables. New v2 starters and presets carry an explicit nominal table tag.
- Users can apply NILTC checks to any imported table. Report off-grid placement without moving
  content; enable guided placement for later edits. Report table, lane, and exit compliance
  separately from ordinary connector joins.

## File contracts and editing

- **Show project.** Version 2 of `.btp.json` adds sections, member commitments, a rectangular
  venue with keep-outs, and named exit links on seams. Tables retain world poses. Attached items
  retain table-local poses. TypeScript normalizes v1 on file open before passing the project to
  Rust, grouping existing tables into one local section while preserving colors, poses, heights,
  layers, unresolved imports, and seam references. Save writes v2. The native geometry oracle can
  still read v1 fixtures. Invalid or canceled imports leave the open project intact.
- **Section bundle.** Save a named section of one or more tables as `.btps.json`. Its version 1
  envelope holds section name, optional owner display name, anchor table ID, and a v2 project
  fragment. Export expresses each table relative to the anchor and includes attached items, their
  layers, internal seams, and named exits. Warn about loose items so the member can attach them.
  Cross-section seams and bring commitments belong to the show. Import previews placement and
  remaps all included IDs and dependent references in one undoable action. Importing one corner
  file four times produces independent copies.
- **Named exits.** Each exit binds an edge of a section's table to outer and inner connectors by
  stable piece and port IDs. Bindings can extend beyond the owning table. An ordinary seam links
  both pairs and optionally references the two named exits. Missing connectors remain repairable.
- **Alignment.** Fix one exit and preview a rigid move of the receiving section from the actual
  outer-port pose. Apply when both lanes meet the existing position, angle, type, and height rules.
  Show the status of both selected lanes, the names of any previously joined neighbors that would
  open, and venue placement conflicts before committing. Preserve the existing NILTC table presets,
  fronts, and 8- and 24-stud guides. The runtime checks declared joins. An independent fixture
  oracle establishes that both tracks in the supplied example form complete loops.
  [NILTC table standards](https://niltc.org/standards/tables)
  [NILTC track specifications](https://niltc.org/standards/track-specifications)
- **Venue.** Enter one rectangular floor with origin at its northwest corner and named rectangular
  keep-outs in studs, inches, or centimeters. Persist studs. Flag rotated tabletop overlap, tables
  outside the room, and table or track footprints crossing keep-outs. Allow edge contact. Report
  these findings separately from tabletop support and track connectivity.
- **Bring lists.** Assign a section to a member. Derive one requirement per member and physical
  part across every section they own, including the supplying section's spanning S8. Count
  expanded kit components once. Leave missing commitments unconfirmed, treat a deliberate zero
  as a possible shortfall, and group pieces without an owner as unassigned. The editor and PDF
  use the same report for track, verified materials, recipe gaps, and unresolved imports.
- **File actions.** Save or open native projects, save or add sections, and import BlueBrick v9
  with unsupported pieces marked at their source positions. Download PDF, PNG, WebP, and
  track-only LDraw. LDraw preserves mapped pose and plate height and groups omissions by supplier
  with links to required custom models.

## Appearance and physical ballast

- Expose green, dark green, tan, light bluish gray, dark bluish gray, and blue baseplate swatches.
  Preserve imported custom colors. Generate original SVG from the existing geometry. Use shared
  32x32 stud patterns and molded edges, exact vector rails and turnout paths, and grayscale-safe
  diagnostic shapes. Show the routes, table seams, and labels first at layout scale. Reveal stud
  highlights, individual ties, rail profiles, and shoulders at close range.
- Apply Bare, Uniform gray, or PennLUG-style shoulder to a track selection as one undoable edit.
  A separate material-count option enables verified recipes without altering rail height or
  geometry. Show the NILTC two-plate spacing guidance beside the height control. Ship track-mounted
  recipes for BrickTracks and TrixBrix R104 from sheet 022A and BrickTracks R120 from sheet 023B.
  Include the verified exact 001A straight recipe with its 44 materials. For each included recipe,
  record material part IDs, colors, quantities, source
  revision, and exact compatible track IDs. Keep recipe gaps visible in the setup packet.
  [NILTC track specifications](https://niltc.org/standards/track-specifications)
  [Straight reference 001A](https://l-gauge.org/downloads/Ref001BallastStraightPennLUGRevA.pdf)
  [R104 reference 022A](https://l-gauge.org/downloads/Ref022BallastR104CurveRevA.pdf)
  [R120 reference 023B](https://l-gauge.org/downloads/Ref023BallastR120CurveRevB.pdf)
- Add source-dimensioned 4DBrix S4, S8, R104, and R120. The R104 spans 10 degrees. The R120 spans
  9 degrees. Store and display the sweep on each 4DBrix curve. Add exact aliases and CAD mappings
  only when supported by upstream IDs and calibrated model transforms. The unresolved-import and
  LDraw omission flows cover models without verified mappings.
  [4DBrix catalog](https://www.4dbrix.com/products/train/2-04-tracks/straights-curves.php)
  [4DBrix R104 dimensions](https://www.4dbrix.com/products/train/2-04-tracks/072/index.php)
  [4DBrix R120 dimensions](https://www.4dbrix.com/products/train/2-04-tracks/073/index.php)
- Use the same SVG scene for the editor and export. PNG and WebP include full layout bounds at
  Standard (2,400 px) or High resolution (4,096 px), with a 12 megapixel cap. Preserve the browser
  and Wasm WebP paths. The landscape Letter PDF has an overview, section detail, and paginated
  member bring lists. Show table dimensions, positions, angles, fronts, seam status, supplier,
  curve radii, and shortfalls. Offer color and grayscale. Keep ordinary print text searchable and
  render fallback glyphs for names outside the PDF font.

## Dispatch and verification

These small milestones can proceed independently when their dependencies are ready. Owners hand
off working changes and concise evidence. Technical checks and review happen as work completes;
there are no human approval gates.

- **Welcome flow** (`vn_welcome`) - Underway. Check all four editable starters and separate Open
  existing action.
- **Starter surfaces** (`vn_surfaces`) - Underway. Check editable 32-grid plates, the two lanes,
  and 192x128 curve footprint.
- **Connector-guided placement** (`vn_snap`) - Underway. Check an actual connector snap wins over
  nearby guide lines.
- **Table standards** (`vn_standards`) - Underway. Check imports preserve geometry and editability,
  new v2 starters are tagged, off-grid checks do not move tables, and lane/exit results are
  separate from joins.
- **Section transforms** (`vn_sections`) - Underway. Check member table turns/grid moves, local
  baseplates, and rigid arbitrary-angle venue rotation.
- **Section files** (`vn_section_files`) - Underway. Check independent copies and safe failure on
  invalid input.
- **Venue and alignment** (`vn_venue`, `vn_alignment`) - Underway. Check fit findings, both lane
  exits, and collateral breaks.
- **Bring lists and exports** (`vn_sharing`) - Underway. Check quantities, full-layout output,
  supplier-grouped omissions, table orientation, and member lists.
- **Whole-show acceptance** (`vn_assembly`) - Underway. Assemble reusable sections and exercise
  repair, save/reopen, bring-list shortfall, and sharing.
- **Release evidence** (`vn_release`) - Underway. Record local artifact checks. Live-site
  publication remains a separate manual action.

## Whole-show acceptance

Author Corner, Yard, Connector, and Siding bundles and one assembled project. Use four independent
instances of Corner. Put Yard and Connector across the north side, and use one two-table Siding
across the south side. Use eight 40x40-inch nominal tables of 128x128 studs on a 576x320-stud
venue. Confirm the reference coordinates, exact approach endpoints, and track runs before UI
integration. Connect the two closed mainlines and let siding branch ends stay open. Yard supplies
the S8 that spans the Yard/Connector seam. One member supplies Yard and Siding so the commitment
test exercises the combined total. Include one verified ballast recipe and a non-Latin name
in the authored show.

From visible controls, assemble the show, rotate a corner, and align both its exits. With one
corner exit already joined, verify the alignment preview identifies any existing neighbor the
move would disconnect. Shift Connector two studs, observe both lanes open at the Yard seam and
the unsupported S8 strip, and repair the alignment. Enter a known parts shortfall, confirm the
hand count, save, and reopen in a fresh browser context. Export while zoomed in and review the
grayscale setup packet without relying on editor state. Run the whole-show scenario with desktop
Chromium, edit section/exit controls in touch Chromium, and verify file and sharing features in
WebKit. Finish by importing the known unresolved BlueBrick fixture and exporting a mapped raised,
rotated track piece to LDraw.

## Scope boundary

Local file exchange covers the coordinator handoff. Accounts, servers, and live collaboration
are outside scope. Rectangular room and keep-out drafting covers tabletop placement. CAD floor
plans and facility-code checks are outside scope. Supported geometry, verified build recipes,
and explicit plate offsets cover the intended track planning. Unsupported track variants,
automated ballast production, clearance and slopes, BlueBrick export, LDraw import, and a 3D
editor are outside scope. Club files, hardware confirmation, Studio access, and GitHub publication
are optional follow-ups to this release acceptance.

Record independent approvals and exact evidence in
[BRICK_TRACK_PLANNER_VFINAL_PROGRESS.md](BRICK_TRACK_PLANNER_VFINAL_PROGRESS.md).
