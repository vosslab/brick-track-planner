# Human guidance

<!-- VENDORED HEADER: START -->
Record the durable guidance Neil Voss states, or approves for preservation here, in his own words:
first person or close paraphrase, one to three lines per bullet. Material he supplies as a source
may inform [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) once it is settled, and an entry of uncertain
origin belongs there too. Rules: [REPO_STYLE.md](REPO_STYLE.md).
[PROPAGATED HEADER - ENTRIES BELOW ARE YOURS]
<!-- VENDORED HEADER: END -->

- Build a member tool around the display area they signed up for. Physical
  tables, room layout, and deciding who gets a curve are outside its scope.
- Baseplates always cover NILTC and general train layout areas. They are the
  surface for track planning, not editable LEGO building pieces.
- Prioritize connecting track: NILTC dual mainlines, parking behind a
  display, and yards that store and dispatch trains.
- Roger chooses whether a member gets a straight or curve assignment. The
  software needs to design a complete buildable track plan for either one.
- Start with the plexiglass at the top. Straight needs one orientation and
  Curve needs two mirrored choices. Let members rotate the view.
- Include the TrixBrix right pass-through single crossover R40 and both
  T-junctions, R40 and R40-R56. Show each as an example.
- Show pictures for the two curve choices. Use the full frontage for the
  longer drive-through siding, with a longer straight in the center.
- Replace the U-shaped staging template with turnarounds based on the
  Downers Grove and Aurora show plans.
- Name turnarounds for their shape and track parts.
- Include the 100 by 70 inch R104 three-quarter return in the main example gallery.
- Use NILTC R120/R104 mainline curves and L-Gauge standards. Remove 9V track.
- Plan flat track only. Elevation-changing parts and vertical layout edits are
  outside this planner's scope.
- Begin from common display sizes while accepting independent custom width and
  depth. A member may enter the size they were assigned.
- Use 10-inch multiples for template and NILTC table dimensions. A 5-inch
  bump-out shifts the opposite edge by the same amount to keep the table
  dimension.
- Use complete, practical arrangements such as a double crossover, aligned
  triple switch, double-ended four-track yard, and genuine R104 wye access.
  Do not make members solve the geometry from individual pieces first.
- This is pre-production. Improve schemas and ownership boundaries directly;
  old layouts do not need compatibility behavior.
- Give members editable track templates. Save track plans in LDraw so someone
  can use them in another program. We only need to reopen our own track files.
- Use 40 inches from the plexiglass as the default NILTC display depth, including
  for the Member R104 right yard. Lead with a 60 by 40 inch display and also
  show a collection of 40 by 40 inch examples.
- Extend the Member R104 right yard toward the back with three more storage
  tracks. Run all six storage tracks to the right edge.
- Use a standard 60 by 40 inch rectangle for Joel's 10-to-0 mainline example.
  Center the bends along the 60-inch frontage.
- Give examples two-to-five-character alphanumeric codes based on their types.
  Keep layouts distinct, show a short perpendicular spur, and use the right
  edge for perpendicular tracks and the four-track right yard's storage.
- Show layouts that can pull from both mainlines, including a pair of
  perpendicular spurs.
- Make track look like the actual parts and preserve small details on
  high-density displays.
- Choose typography from Atkinson Hyperlegible Next, Atkinson Hyperlegible
  Mono, and IBM Plex Sans Condensed. Follow [FONT_STYLE.md](FONT_STYLE.md).
- Offer shorter examples where the length of straight storage can vary.
- Use automated screenshots and fine-grained measurements to catch even
  small misalignments between controls. Measure button centering and insets
  against the visible column edges.
- Show each example layout in its own screenshot and show the start screen
  and blank editor separately.
- I use the screenshots to judge quality. Refresh the affected screenshots
  whenever the examples or interface change.
- Write the README and screenshot walkthroughs for a first-time planner user.
- Tell members what space and track an arrangement needs and why a preview
  cannot fit. Make moving and deleting selected track obvious on desktop
  and mobile.
- Use mouse editing on desktop and tap-to-move on mobile. Let members move
  several selected pieces together.
- Make track editing feel like LibreOffice Draw or Inkscape. Keep moved,
  pasted, or duplicated track on the destination click or tap.
- Let members delete a selection of several objects. Support Command-click
  and Command-drag for selecting track on Mac. Use Command+A to select all
  track in the drawing.
- Treat continuation at a club layout edge as part of the rail geometry, not a
  separate editing concept.
- Users get frustrated when they hold a piece and cannot put it down.
  Implement place-and-flag: let them drop the track, show what needs fixing,
  and keep the solution simple.
- Be very tolerant at the design boundary. A saved track plan can extend
  past the border on purpose to connect to another section.
- Use layout tabs inside the planner so members can copy track between yards
  and compare variations. Ask before closing a layout with unsaved edits.
- Give those editing workflows priority over further Undo and Redo work.
- Export PDFs in color only.
- Favor track ends and the club grid. Keep finer placement for special cases
  and use 90-degree turns for track rotation.
- Fill straight gaps between components. Use larger parts and kits for
  the rest of the layout geometry.
- Keep blocking checks tied to meaningful failures with a concrete recovery
  action. Use temporary checks for implementation evidence and keep only
  permanent tests that earn their upkeep.
- Ground thresholds, equivalence checks, test matrices, and tool-version
  requirements in demonstrated product or compatibility needs.
- Use the GitHub Pages workflow to build and upload the site. Run critical
  tests, including Playwright, locally. Push to GitHub only after all local
  checks pass.
