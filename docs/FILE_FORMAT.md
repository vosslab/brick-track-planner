# Track plan files

A saved member design is an LDraw model with the extension `.ldr`. The
planner reads the same format for **Open track plan** and its built-in examples.
Each file represents one display area. Opening a template creates an editable
plan in the browser. Saving downloads the member's copy. The
[straight mainline template](../templates/member-straight.ldr) is a complete example.

## Track placement

Each catalog track piece has a standard LDraw type-1 reference. Its translation
and rotation place it in the model. Moving a reference moves the track. One
stud is 20 LDraw units (LDU) and one plate is 8 LDU. The planner's right and
down on the drawing map to LDraw +X and -Z. Raising track moves it toward -Y.
For example, this is the first outer straight in the 60 by 40 inch template.

```text
1 72 160 -24 -160 1 0 0 0 1 0 0 0 1 53401.dat
```

Other LDraw programs can read the references as a model. The plastic LEGO straight and
R40 curve use standard library parts `53401.dat` and `53400.dat`. When a
plan uses BrickTracks R104 or R120 curves, the file includes the corresponding
detailed models from [Michael Gale's L-Gauge curve pack](https://l-gauge.org/downloads/BricktracksCurvesRev1.0.zip).
Track without a verified library model uses a simplified drawing built from
its catalog geometry and embedded in the file. Rail pieces include paired,
raised rail strips and regular sleeper slabs. A switch preserves each measured
route through that shared track geometry. A switch stand has no rail path, so
its embedded model remains its measured footprint.

## Planner editing information

Lines starting with `0 !BRICKTRACK` identify planner files and store the data
needed to continue editing. These include the design name, width and depth,
public edges, straight or corner assignment, and named inner and outer
mainline exits. Rectangular plans anchored at the drawing origin can use
`FORMAT 1`. Custom footprints use `FORMAT 2`. The `OUTLINE` record follows
`AREA` and lists 4 to 256 clockwise X/Y pairs in studs, with an implicit
closing segment. `AREA` records the outline's overall width and depth. A
`FRONT_LINE` record gives the signed stud coordinate of each public edge,
as in `0 !BRICKTRACK FRONT_LINE @north -16`.

Each track reference has a stable item ID, catalog part ID and
layer. Saving includes track on hidden layers. The planner restores their
visibility on open, while LDraw viewers can display the whole model. Grouping
and ballast settings stay with the item. The automatically tiled baseplate
surface is clipped to the area outline.

Track geometry, handoff checks and inventory come from the planner's catalog.
An unresolved BlueBrick record retains its source ID, description and bounds
for the member to review. A third-party LDraw editor may discard application
metadata on save. Keep the planner-written original for further editing here.

The planner recognizes its own track-plan records and validates them before
replacing the current design. General LDraw model import is outside the Open
workflow. The JSON interface between the editor and the geometry engine is
internal. [LDraw file specification](https://www.ldraw.org/article/218.html)
and [multi-part document specification](https://www.ldraw.org/article/47.html).

## Catalog contract

`data/catalog.json` contains individual physical parts and optional kits.
Parts declare connector ports, centerline paths, a footprint, and internal
`routes`. A route has `from`, `to`, and `path`, and may identify a curve radius
or a `switch`, `curve`, or `crossing` event. This separates a route a train can
take from the visual outline of the part.

Kits expand into physical pieces when placed. Inventory, route tracing, export,
and collision checks therefore see the same track. A kit may note parts sold
separately when a manufacturer's product needs an entrance switch or extension.
Some BlueBrick records measure an assembled unit. Its catalog `inventory`
lists the build components and their quantities. The drawing uses the measured
rail geometry, and the on-screen tally and PDF use the component quantities.

## Imports and exports

BlueBrick Map v9 import supports the documented XML subset in
[`src/project_files.ts`](../src/project_files.ts). The importer transfers track
geometry into one design area. It never creates physical table records. Imported
9V parts remain unresolved because the planner does not substitute a different
electrical track system.

PNG and WebP export the visible drawing. PDF exports the member build sheet.
