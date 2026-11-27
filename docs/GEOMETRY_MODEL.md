# Geometry model

The planner stores one member design area and its track in stud coordinates.
TypeScript owns editing state and Rust/Wasm evaluates physical geometry,
connectors, clearance, and routes.

## Coordinates and coverage

New rectangles begin at `(0, 0)`. Footprint edits can extend to signed
coordinates while keeping the track origin fixed. X increases right and Y
increases down. A track pose is `(x, y, angle)` in studs and degrees.

Every design area is covered by derived 32 by 32 stud baseplate cells. The
tiled grid scales with the area and is a visual and build-planning surface, not
track geometry or a collection of movable objects. The area outline guides
arrangement recommendations and allows rectangular, bumped-out, or custom
outlines.
It is a single clockwise right-angle ring. The engine measures track
overhang against the ring with a 0.05-stud edge tolerance.

## Mainline assignments

NILTC uses two rails whose centerlines are 8 and 24 studs from the public
edge. A straight assignment has one public edge. A corner assignment has two
adjacent public edges and a 90-degree bend: R120 on the outside and R104 on
the inside.

A partial shift keeps the public reference line where frontage remains. Moving
the whole frontage moves the line, so existing rails can need realignment.

The starter geometry is a useful club standard, not an editing constraint.
General plans have no required mainlines. Every plan uses the same ordinary
track-fit diagnostics, while a private parking track or yard remains free to
use the geometry its builder chooses.

## Track and route graph

Each catalog part declares rail ports, visible centerline paths, a footprint,
and internal routes between named ports. Switch routes share a common endpoint
and never create a fictional branch-to-branch path. A crossing has only its
real rail continuities. When two compatible rail ports coincide, they form an
external route edge.

The engine combines internal and external edges into a route graph. A route
trace begins at a selected rail end and highlights each physical piece and
joint on the way to a selected siding or yard track.

## Catalog and assemblies

A catalog kit is a measured arrangement of individual track parts. Placing a
kit expands it immediately into those parts. One layout representation drives
drawing, connector checking, collision checking, inventory, routing, and
export.

The R104 and R120 NILTC curve records use 11.25-degree sections. Four sections
make a 45-degree bend and eight make a 90-degree bend. The source measurements
and product links live in [`../data/CATALOG_SOURCES.md`](../data/CATALOG_SOURCES.md).

## Placement findings

Ordinary track drops commit even when track overlaps. Track can extend past
the design area, including a clean joint at a display edge. Analysis derives findings from the
current project, so editing, Undo/Redo, reopening a saved file, and switching
layout tabs keep the drawing and findings in agreement. Findings clear when
the geometry is repaired. Guided fitting and overhang measurement both allow
0.05 stud of offset at the design boundary.

Overlap findings use modeled footprints for ordinary straights and curves,
and routed paths for molded parts and adapters. Angled straight beds allow
half a stud of modeled corner intrusion to accommodate valid kit contacts;
centerline crossings still produce findings. Matching facing catalog
connectors, including adapters, form joints. These checks describe the current
modeled geometry, not physical clearance.

Boundary track uses the same place, move, rotate, and delete tools as every
other piece. Guided arrangement search checks its fit before proposing parts.

## Limits

Track item coordinates are individually limited to +/-100,000 studs. The planner
checks a two-dimensional top-down track plan. Elevation-changing track is out
of scope. It does not certify structural support, scenery, vehicle clearance,
electrical compatibility, or physical switch reliability.
