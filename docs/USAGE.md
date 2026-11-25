# Usage

## Start the planner

Build and serve the app locally with the repository's setup instructions in the
[README](../README.md). The planner saves files to your computer. After the local build is served,
project editing, the packaged examples, and exports run in the browser. Follow the BrickTracks
LDraw bundle link when opening those custom part models in an LDraw viewer.

## Start a layout

Choose **40 x 40**, **60 x 40 Straight**, **60 x 40 Curve**, or **Advanced** on the welcome screen.
On either straight starter, choose **Add a siding** to place a turnout and a connected parallel
track in the marked space behind the inner mainline. Both mainline exits stay in place. Extend the
siding from its open end, or choose **Undo** to remove the whole siding.

Advanced starts with an empty layout. Use **Open existing project** to load a saved `.btp.json`.
While editing, use **Open** in the header. The preset menu offers a blank layout, NILTC table sizes,
and a custom table.

Select track in the library and click or tap the table. Use **Rotate 90 degrees** to rotate the
active placement or selection. A compatible connector takes priority.
On a marked NILTC table, a first straight near a lane guide can snap to the exact lane. The
32-stud grid guides member table and baseplate placement, with rotations in quarter turns.
Use the section controls to move all tables and attached items in a section together.
For custom or imported tables, use **Select NILTC checks** in the table inspector to check the
guide alignment and height of named exits without changing their current geometry.

## Move around the tabletop

- Scroll with two fingers over the tabletop to pan in any direction.
- Pinch over the tabletop to zoom around the pointer. With a mouse, use Control and the scroll
  wheel to zoom.
- Focus the tabletop and hold **Space** while dragging to pan over track or baseplates. You can
  also drag empty space to pan. Use **Fit view** to see the full layout again.

## Try the whole-show fixture

1. In **Open an example...**, choose **Whole Show**. The fixture contains eight nominal
   tables and seven section instances built from four templates (Corner, Yard, Connector, and
   Siding). It includes venue bounds, keepouts, and member assignments.
2. Open **Sections & exits** in the panel. Inspect the Yard, Connector, Corner, and Siding
   sections. The **Import section** control accepts the packaged `.btps.json` bundles; choose an
   anchor placement in the preview before importing a copy. Section copies receive new IDs. Use
   **Export section** to save a selected section as a portable bundle.
3. Open **Venue** to inspect the room rectangle and named keepouts. Venue coordinates start at the
   northwest corner. Keepout coordinates describe each rectangle's center. Review the fit findings
   in the diagnostics panel.
4. Open **Show inventory** to review visible track totals, recipe-derived ballast materials, and
   unassigned items. Assign a section to a member in **Sections & exits** to group its requirements
   under that member. Enter quantities and choose **Apply commitments** to compare them with the
   required amounts. The report lists missing recipes and unresolved imports as unknowns.
5. In **Sections & exits**, select **Connector**, change **X (studs)** from 288 to 290, and choose
   **Move section**. Both lanes open at Yard / Connector and Connector / Northeast, exposing an
   unsupported strip under the Yard S8. Choose **Undo** to restore the fixture.
6. Choose **PDF**, select **Grayscale** or **Color**, and export the setup packet. For PNG or WebP,
   choose **Standard** (2,400-pixel long side) or **High** (4,096-pixel long side); either is capped
   at 12 megapixels. Save the project and reopen it to continue later.

The fixture's expected coordinates, joins, and intentional open siding end are in
[`active_plans/active/VFINAL_FIXTURE.md`](active_plans/active/VFINAL_FIXTURE.md). The section file
contract is in [`FILE_FORMAT.md`](FILE_FORMAT.md).

## Import and share

Use **Import BlueBrick** for a local BlueBrick Map v9 file. Review its import preview and warnings
before accepting. Unsupported source pieces stay as unresolved items so the project retains a
record of them.

PNG and WebP show the complete visible layout. PDF includes an overview, section details, and
paginated member bring lists. LDraw preserves the pose and height of mapped visible track. Its
report lists unmapped track by supplier and part, lists unresolved items, and links to required
custom models. Tables, scenery, baseplates, and ballast are outside the track model. Current
mappings cover LEGO 9V S16, R40, and right/left switches plus BrickTracks R104/R120. See
[`FILE_FORMAT.md`](FILE_FORMAT.md) for file and export details.
