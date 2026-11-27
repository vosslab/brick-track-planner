# Track plan files

A saved member design is an LDraw model with the extension `.ldr`. The
planner reads the same format for **Open track plan** and its built-in examples.
Each file represents one display area. Opening a template creates an editable
plan in the browser. Saving downloads the member's copy. The
[straight mainline template](../templates/member-straight.ldr) is a complete example.

## Track placement

Each catalog track piece has a standard LDraw type-1 reference. Its translation
and rotation place it in the model. Moving a reference moves the track. One
stud is 20 LDraw units (LDU). The planner's right and down on the drawing map
to LDraw +X and -Z. Each catalog part uses its fixed LDraw baseline. For
example, this is the first outer straight in the 60 by 40 inch template.

That baseline preserves the part model's own geometry, such as sleepers and
rails. It is not layout elevation and cannot be changed in the planner.

```text
1 72 160 -8 -160 1 0 0 0 1 0 0 0 1 53401.dat
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

The LEGO S16 crossing straight and S16 straight with clips use embedded
schematics. They use standard 16-stud connections and retain their separate
identities in the planner and parts tally.
[Crossing straight (2824)](https://www.bricklink.com/v2/catalog/catalogitem.page?P=2824)
[Straight with clips (7442)](https://www.bricklink.com/v2/catalog/catalogitem.page?P=7442)

## Planner editing information

Lines starting with `0 !BRICKTRACK` identify planner files and store the data
needed to continue editing. These include the design name, width and depth,
public edges, and straight or corner assignment. The optional `OUTLINE` record
follows `AREA` and lists 4 to 256 clockwise X/Y pairs in studs, with an
implicit closing segment. Without `OUTLINE`, the area is the rectangle from
`(0, 0)` to its saved width and depth. `AREA` records the outline's overall
width and depth. A
`FRONT_LINE` record gives the signed stud coordinate of each public edge,
as in `0 !BRICKTRACK FRONT_LINE @north -16`.

The planner recognizes `PROJECT`, `AREA`, optional `OUTLINE`, `FRONT`,
`FRONT_LINE`, `LAYER`, `TRACK`, and `UNRESOLVED` metadata records. A `TRACK`
record is followed by its LDraw type-1 placement. Embedded LDraw submodels
carry catalog parts without a published library model.

Each track reference has a stable item ID, catalog part ID and
layer. Saving includes track on hidden layers. The planner restores their
visibility on open, while LDraw viewers can display the whole model. Grouping
and ballast settings stay with the item. The automatically tiled baseplate
surface is clipped to the area outline.

Track geometry, ordinary fit diagnostics, and inventory come from the
planner's catalog.
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

BlueBrick import reads `Map` XML with `Layers`, `Bricks`, and part placement
fields. The importer transfers track geometry into one flat design area. It
warns when the source uses elevation and keeps mapped track in the top-down
plan. [BlueBrick importer](../src/project_files.ts)

PNG and WebP export the visible drawing. PDF exports the member build sheet.
