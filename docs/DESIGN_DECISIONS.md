# Design decisions

<!-- VENDORED HEADER: START -->
Record each durable decision about how this code and repository are shaped, once it is settled, with
the reasoning a later reader needs. Guidance Neil Voss states belongs in
[HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md), dated history in `docs/CHANGELOG.md`, open discussion in
`docs/active_plans/decisions/`. [PROPAGATED HEADER - ENTRIES BELOW ARE YOURS]
<!-- VENDORED HEADER: END -->

### Keep layouts in session tabs

**Decision.** Keep independent layout states and views in named tabs above
one shared drawing. Opening a design adds a tab. Duplicating includes unsaved
edits and the current view. Save and explicit close belong to the active layout.

**Why.** Members can transfer track between yards and compare a variant with
its original without replacing their work or managing several planner windows.

**Consequence.** Switching cancels outgoing previews and restores the selected
layout's view and history. Only explicit close asks to discard unsaved work.
Tabs last for the current session. Save each layout you want to keep as LDraw.

**Owner.** [main.ts](../src/main.ts), [editor_tabs.ts](../src/editor_tabs.ts),
[editor_files.ts](../src/editor_files.ts)

### Copy independent track selections

**Decision.** Capture selected track and its internal joints in a shared
session clipboard. Paste the complete selection as one undoable
placement with fresh piece and group identities.

**Why.** A copied siding must keep its geometry while remaining independent
of its source and of later copies, even after the source layout closes.

**Consequence.** Complete copied arrangements retain their kit identity.
Fragments become ordinary track. Geometric problems become findings on the
placed copy. Switching cancels an unfinished preview while keeping the clipboard.

**Owner.** [editor_track.ts](../src/editor_track.ts),
[editor_placement.ts](../src/editor_placement.ts)

### Build and upload with Pages

**Decision.** The GitHub Pages workflow builds and uploads the site for
deployment. Run critical release tests locally and push to GitHub only after
all local checks pass.

**Why.** Pages needs a publishable bundle. Local tests verify track geometry,
saved plans, and member editing flows.

**Consequence.** The local release verifier builds the Pages artifact and runs
the Rust, Node, and Playwright suites. The workflow checks that the site can
build and that the required files are present.

**Owner.** [.github/workflows/deploy-pages.yml](../.github/workflows/deploy-pages.yml),
[devel/verify_release.sh](../devel/verify_release.sh)

### Keep one design area per project

**Decision.** A native project has one `area` with dimensions, public edge or
corner, NILTC assignment, and named boundary exits.

**Why.** A member owns a display space and track inside it. Physical table maps
and show-wide placement are owned outside this application.

**Consequence.** Items use area coordinates directly. Tables, sections, seams,
venue placement, members, and movable baseplates are absent from version 3.

**Owner.** [FILE_FORMAT.md](FILE_FORMAT.md)

### Keep the top edge public in new member designs

**Decision.** Start straight assignments along the top and offer two mirrored
corners at the entered dimensions.

**Why.** A common plexiglass edge gives members the same frame of reference
when comparing display plans.

**Consequence.** Quarter turns affect the editor view. Saved files keep their
original track positions and orientations.

**Owner.** [area_form.ts](../src/area_form.ts),
[editor_camera.ts](../src/editor_camera.ts)

### Draw track from available part models

**Decision.** Project verified LDraw parts into vector artwork and draw other
rail pieces from their measured catalog paths. At thumbnail scale, use compact
rail drawings.

**Why.** Real sleepers, interlocks, and switch controls become legible as the
view gets larger. Shared SVG paths scale for high-density displays and exports.

**Consequence.** Regeneration uses LDraw source files and Shapely. The planner
bundles the resulting paths and uses the catalog for placement and collision
checks.

**Owner.** [scene_appearance.ts](../src/scene_appearance.ts),
[CATALOG_SOURCES.md](../data/CATALOG_SOURCES.md)

### Provide two turnarounds drawn from club shows

**Decision.** The R104 semicircle return follows the 130 by 80 inch west-end
return in the November 2026 Downers Grove drawing. The R120 corner return
follows the 120 by 100 inch east-end return shown there and in the March
2026 Aurora drawing. The compact templates keep both catalog routes in a 130
by 70 inch rectangle and a 120 by 90 inch outline with a 30 by 30 inch cutout.

**Why.** The 180-degree bend and diagonal return are a different layout from
the mixed-radius loop. Both return trains to the other lane at one boundary.

**Consequence.** Use General plans with a named handoff for each pair of lanes.
The openings follow the 8- and 24-stud offsets at +2 plates within the
planner's connector tolerance. The show drawings provide the reference
shapes and original dimensions. The bundled plans fit the stock-part
reconstructions into compact outlines.

**Owner.** [templates](../templates/), [editor_files.ts](../src/editor_files.ts)

### Lead with the mainline and back-out siding examples

**Decision.** Identify examples by type code and name. Frame the track in
each preview. Group the cards by display size with 60 by 40 inches first.
In each group, lead with the mainline and back-out siding, then order the
remaining cards by total physical track count.

**Why.** Members can identify a plan in conversation and compare the track
it requires.

**Consequence.** Keep the list in track count order when editing the plans.
PFS, 4TRY, and PFS40 use a west crossover to serve every storage track
from both mainlines while keeping both through routes.
TJ56 uses a General plan because the R40&ndash;R56 assembly has less than the
NILTC-required spacing between the inner switches and the crossing.

**Owner.** [track_examples.json](../data/track_examples.json)

### Save designs and templates as LDraw track plans

**Decision.** Use the same LDraw format for member downloads and bundled
templates. Track placement belongs in LDraw part references. Planner metadata
holds the design area, handoffs, and other editing details.

**Why.** Members can share their track with other LDraw tools and reopen it
here without a second project file. The editor can stay focused on track.

**Consequence.** Open supports the planner's own files. The geometry engine
still receives the validated in-memory project through its JSON interface.

**Owner.** [FILE_FORMAT.md](FILE_FORMAT.md)

### Derive baseplate coverage

**Decision.** Render a 32-stud baseplate grid from the design area.

**Why.** Every supported train display area is fully covered, and rail geometry
does not depend on individual baseplate objects.

**Consequence.** Coverage is always current after an area resize and cannot be
accidentally moved away from track.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md)

### Edit outlines around fixed track

**Decision.** Keep track in place when changing a display outline. Move both
edges of a NILTC span together when offsetting part of a table.

**Why.** Members can fit a design to the available space and keep the depth
of each shifted table span.

**Consequence.** The preview identifies exposed pieces and handoff changes
before the member applies the outline. The saved outline drives the same
drawing and fit checks after reopening.

**Owner.** [area_outline.ts](../src/area_outline.ts),
[FILE_FORMAT.md](FILE_FORMAT.md)

### Place track in one action

**Decision.** Commit a move on drag release. For Move, Duplicate, and
paste, commit placement on the destination click, tap, or keyboard
activation. Keep explicit confirmation for a straight gap or a new arrangement.

**Why.** The destination gesture completes an ordinary drawing edit. A gap
fill or arrangement calls for a review of the parts the planner proposes.

**Consequence.** Hover previews placement with a mouse. Each input uses the
same snapping and history. Placement is one undoable edit. Structural limits
and named mainline handoffs remain protected.

**Owner.** [src/editor_track.ts](../src/editor_track.ts),
[src/editor_placement.ts](../src/editor_placement.ts),
[src/editor_arrangements.ts](../src/editor_arrangements.ts)

### Make mouse editing predictable

**Decision.** Select the top track under the pointer, and let **Next track
here** cycle overlapping pieces. Drag the selected piece or selection. Keep
modifier-key box selection, desktop panning, and touch gestures. Let Escape
cancel a drag at any point; an outside direct drag cancels, while explicit
Move remains ready to retry. Refresh the preview after camera movement.

**Why.** Visible rails and ballast provide usable selection targets, including
when pieces overlap. Empty space between crossover routes remains available
for panning.

**Consequence.** For rail-end snapping, grab near an exposed rail end and keep
the pointer close; prefer the nearest exposed end when choosing a valid joint.
Show grid feedback when distinct, equally close valid snaps compete, and fall
back to the grid. Expose **Rail ends or 8-stud grid** and **1-stud grid** before
dragging and for Move; the 1-stud grid bypasses automatic rail-end snapping.
Apply the choice to the next translation and reset it after finish,
cancellation, or tab change. Normal placement warnings still allow the drop.

**Owner.** [src/main.ts](../src/main.ts),
[src/editor_track.ts](../src/editor_track.ts),
[src/editor_placement.ts](../src/editor_placement.ts)

### Place track and flag problems

**Decision.** Let members put down ordinary track with overlaps, track outside
the design area, or facing rail ends at different heights. Derive findings
from the current project and identify the affected track in the drawing.

**Why.** A member can finish a gesture and then repair the layout without
remaining stuck in a placement preview.

**Consequence.** Moving, deleting, or undoing the problem clears its finding.
Save/reopen and tab changes recompute the same findings. Open rail ends remain
ordinary connection points. Guided arrangement search still helps find a fit.
The project format and editing modes stay unchanged.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md),
[editor_placement.ts](../src/editor_placement.ts)

### Treat routes as catalog data

**Decision.** Every physical catalog part defines its valid port-to-port
routes, independent of its visible rail paths and footprint.

**Why.** A track drawing alone cannot tell whether a train can take a turnout,
cross a double crossover, or reach a storage track.

**Consequence.** The route graph can trace real travel paths, validate mainline
handoffs, and keep isolated crossing lines isolated.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md)

### Compare rendered control geometry

**Decision.** Check control alignment from rendered CSS-pixel rectangles
and save screenshots and measurements with each browser test run.

**Why.** Rectangle comparisons catch small shifts in edges and spacing
across browsers. Screenshots show what a member sees in the same state.

**Owner.** [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md#control-alignment)

### Expand arrangements into physical parts

**Decision.** A crossover, triple switch, or yard template becomes the actual
parts in its measured assembly when placed.

**Why.** The parts list, connector graph, fit feedback, and export need the
same physical representation.

**Consequence.** Product templates can identify separately required entrance
switches and specialty connectors without double-counting them.

**Owner.** [data/catalog.json](../data/catalog.json)

### Measure arrangement requirements from the placement geometry

**Decision.** Use the catalog parts and rail endpoints to describe the
selected arrangement's footprint and track requirements. Use the fit search
to report the obstacle on the member's current plan.

**Why.** Storage choices change the footprint, and the same arrangement can
fit one plan while an obstruction or incompatible rail blocks another.

**Owner.** [src/arrangement_anchors.ts](../src/arrangement_anchors.ts)

### Keep standards checks on the protected mainline

**Decision.** Apply NILTC lane, height, radius, and event-spacing checks to
the named mainline paths. Treat private-yard feedback as advisory.

**Why.** Club handoffs need consistent geometry while members need room for
compact and creative storage track.

**Consequence.** R40 and R56 catalog pieces remain available for yards and
general layouts without changing the required R104/R120 mainline geometry.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md)
