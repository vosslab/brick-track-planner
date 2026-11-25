# Geometry model

This document records the agreed v1 layout dimensions and connection behavior. The current
local/world pose contract is implemented in [`src/project.ts`](../src/project.ts); the Rust engine
owns geometry evaluation and fit checks.

## Table sections

NILTC sections use nominal stud dimensions at 4 studs per inch:

| Table size | Nominal footprint |
| --- | --- |
| 30x40 inches | 96x128 studs |
| 40x40 inches | 128x128 studs |
| 40x60 inches | 128x192 studs |

Dimensions list the shorter side first; a section may be rotated in a layout.

Each section has a local placement transform. Table-fit checks use the visible footprint union of
all placed sections, including across joins.

## Track placement

- Track XY positions use continuous stud coordinates; placements can use fractional studs.
- Track height is a signed integer number of plates from the project baseline. One plate is 8 LDraw
  units (3.2 mm) vertically.
- Exact X/Y port snapping joins compatible track ports.
- The catalog includes LEGO S16/R40, BrickTracks S4/S8 and R104/R120, plus TrixBrix S8/S32 and
  R104/R120.
- A TrixBrix R120 catalog piece is one installed 11.25-degree section; the source lists two printed
  pieces for that section.

## Section guides

- The front dual lane guides are 8 and 24 studs from the front edge.
- Each section seam has two persistent port pairs.
- The layout includes the planned S8 gap; its detailed fit contract is defined with the geometry
  fixtures.

See the [active v1 plan](active_plans/active/BRICK_TRACK_PLANNER_V1.md) for milestone and
validation requirements.
Catalog measurements and vendor sources are listed in
[CATALOG_SOURCES.md](../data/CATALOG_SOURCES.md).
