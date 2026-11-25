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
track geometry or a collection of movable objects. Track footprint checks
compare each physical track footprint with the one area rectangle.

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

## Limits

Stored coordinates are individually limited to +/-100,000 studs. The planner
checks a two-dimensional top-down track plan. It does not certify structural
support, scenery, vehicle clearance, electrical compatibility, or physical
switch reliability.
