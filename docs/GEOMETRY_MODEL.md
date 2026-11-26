# Geometry model

The planner stores one member design area and its track in stud coordinates.
TypeScript owns editing state and Rust/Wasm evaluates physical geometry,
connectors, clearance, and routes.

## Coordinates and coverage

The design area begins at `(0, 0)`. X increases right and Y increases down. A
track pose is `(x, y, angle)` in studs and degrees. Track height is a signed
whole number of plates. One plate equals 3.2 mm.

Every design area is covered by derived 32 by 32 stud baseplate cells. The
tiled grid scales with the area and is a visual and build-planning surface, not
track geometry or a collection of movable objects. The area rectangle guides
arrangement recommendations and provides the boundary for named handoffs.
The engine measures footprint overhang relative to that rectangle.

## Mainline assignments

NILTC uses two rails whose centerlines are 8 and 24 studs from the public
edge, at two plates above the baseplate. A straight assignment has one public
edge. A corner assignment has two adjacent public edges and a 90-degree bend:
R120 on the outside and R104 on the inside.

An area records named boundary exits for both lanes. An exit contains the
physical piece ID and port ID, plus the boundary edge it reaches. It is the
member's handoff to the neighboring club display, so checking follows the
actual assembled track instead of a drawn guide.

NILTC checks apply to those protected mainline routes. They validate lane
position, height, connector alignment, minimum curve radius, and straight
space between track events. A private parking track or yard remains free to use
the geometry its builder chooses.

## Track and route graph

Each catalog part declares rail ports, visible centerline paths, a footprint,
and internal routes between named ports. Switch routes share a common endpoint
and never create a fictional branch-to-branch path. A crossing has only its
real rail continuities. When two compatible rail ports coincide at the same
height, they form an external route edge.

The engine combines internal and external edges into a route graph. A route
trace begins at a boundary exit and highlights each physical piece and joint on
the way to a selected siding or yard track. This is also how the mainline
checks distinguish a connected storage track from a nearby but isolated rail.

## Catalog and assemblies

A catalog kit is a measured arrangement of individual track parts. Placing a
kit expands it immediately into those parts. One layout representation drives
drawing, connector checking, collision checking, inventory, routing, and
export.

The R104 and R120 NILTC curve records use 11.25-degree sections. Four sections
make a 45-degree bend and eight make a 90-degree bend. The source measurements
and product links live in [`../data/CATALOG_SOURCES.md`](../data/CATALOG_SOURCES.md).

## Placement findings

Ordinary track drops commit even when track overlaps or has facing rail ends
at different heights. Track can extend past the design area, including a
clean joint through a named handoff. Analysis derives findings from the
current project, so editing, Undo/Redo, reopening a saved file, and switching
layout tabs keep the drawing and findings in agreement. Findings clear when
the geometry is repaired. Guided fitting and overhang measurement both allow
0.05 stud of offset at the design boundary.

Overlap findings use modeled footprints for ordinary straights and curves,
and routed paths for molded parts and adapters. Angled straight beds allow
half a stud of modeled corner intrusion to accommodate valid kit contacts;
centerline crossings still produce findings. Matching facing catalog
connectors, including adapters, produce height findings when their heights
differ. These checks describe the current modeled geometry, not physical
clearance.

Guided arrangement search continues to look for a fit before proposing parts.
File validation, supported coordinate and item limits, and named mainline
handoff protection remain enforced.

## Limits

Stored coordinates are individually limited to +/-100,000 studs. The planner
checks a two-dimensional top-down track plan. It does not certify structural
support, scenery, vehicle clearance, electrical compatibility, or physical
switch reliability.
