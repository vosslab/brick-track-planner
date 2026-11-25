# File format

The planner saves editable member designs as `.btp.json`. Version 3 stores one
design area and its track. The format is validated before a project opens.

## Project shape

Required root keys are `version`, `name`, `area`, `layers`, and `items`.

```json
{
  "version": 3,
  "name": "Example yard",
  "area": {
    "width": 192,
    "depth": 128,
    "fronts": ["north"],
    "niltc": "straight",
    "exits": []
  },
  "layers": [{ "id": "layout", "name": "Layout", "visible": true }],
  "items": []
}
```

Coordinates are studs, with X increasing right and Y increasing down. Angles
are degrees. Every item pose is measured directly in the design area. Width and
depth must be positive and coordinates must be between -100,000 and 100,000
studs.

`area.fronts` contains one public edge for a straight assignment or two
adjacent public edges for a curve. `area.niltc` is `straight` or `corner` when
the design uses club mainlines. `area.exits` names the outer and inner rail
endpoints that connect to the neighboring club display.

Track items have `kind: "track"`, `partId`, `heightPlates`, `layerId`, and a
pose. `groupId` optionally identifies the arrangement that placed related
physical pieces. Unresolved import items retain their `sourceId`, source name,
and orientation. Their width and depth are the axis-aligned bounds BlueBrick
recorded after rotation.

The baseplate grid is derived from the area. It is not saved as movable items.

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

PNG, WebP, and PDF export the visible design. LDraw exports only visible mapped
track and reports omitted parts and custom model requirements. It does not
export the derived baseplate grid, ballast, or unresolved objects.
