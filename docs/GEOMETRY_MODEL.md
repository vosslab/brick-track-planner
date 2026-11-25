# Geometry model

The planner keeps track, table, section, and venue geometry in stud coordinates. TypeScript stores
the project and poses; the Rust-Wasm engine evaluates ports, seams, coverage, and fit. The contracts
are implemented in [`src/project.ts`](../src/project.ts), [`src/sections.ts`](../src/sections.ts),
and [`rust/`](../rust/).

## Coordinates and placement

The plan view has X increasing right and Y increasing down. A pose is `(x, y, angle)` in studs and
degrees. Track positions may use fractional studs. Track height is a signed whole number of plates;
one plate is 8 LDraw units (3.2 mm). The height value affects connector fit and vertical export
placement. Track appearance and recipe counting are independent of height.

Connector-guided placement uses catalog port geometry and chooses a target that joins compatible
ports. Grid guides help place parts but do not replace connector alignment. The first loose track
piece can snap to a real connector. When a named section exit is dragged to another section's exit,
the preview reports both lane results and any existing seam that the move would break.

## Sections and tables

NILTC nominal sections use 4 studs per inch:

| Table size | Nominal footprint |
| --- | --- |
| 30 x 40 inches | 96 x 128 studs |
| 40 x 40 inches | 128 x 128 studs |
| 40 x 60 inches | 128 x 192 studs |

Each table has a local pose within its section. Moving or rotating the section applies one rigid
transform to its tables and attached items; the layout stores their resulting world poses. Nominal
member tables move on a 32-stud grid and turn in quarter turns. When a dragged table is near a
visible nominal table edge, placement can snap it to an adjacent grid-aligned edge. Baseplates use
a 32-stud grid and quarter-turn angles in their parent table's local coordinates. These placement
rules do not automatically tag an imported table for NILTC checks.

NILTC modes are explicit opt-in metadata: `straight` checks the 8- and 24-stud lane guides, and
`corner` checks the corner layout. The checks report off-grid tables or baseplates, missing or
incorrect-height mainlines, and exits off the standard. The preset table sizes alone do not enable
these checks. NILTC lane findings are separate from connector seam findings.

Each named section exit identifies a table edge and its outer and inner connector endpoints. A seam
stores both lane pairs between tables, and can reference named exits. The editor checks compatible
port type, position, angle, and height; it reports joined, open, misaligned, missing, hidden, or
ambiguous ends. An exact snap or seam repair changes endpoint references, not the catalog's port
geometry.

## Venue fit and diagnostics

A venue is a width and depth rectangle whose northwest corner is `(0, 0)`. X increases right and Y
increases down. A keepout stores its center `(x, y)` and positive width and depth; it is a centered
rectangle. Table and item positions remain in layout coordinates when a venue or keepout is edited.

Fit diagnostics report table overlap, table footprints outside the venue, and table or item overlap
with keepouts. Track overhang diagnostics identify track footprint outside its supporting tabletop;
seam diagnostics report connector relationships. These checks describe the saved 2D geometry and
catalog footprints. They do not certify real-world clearance, slopes, structural support, building
rules, or safe operation. Stored coordinates are individually limited to +/-100,000 studs; the
limit does not cap combined layout bounds or image/PDF bounds.

The v-final reference layout and its measured endpoints are recorded in
[`active_plans/active/VFINAL_FIXTURE.md`](active_plans/active/VFINAL_FIXTURE.md). Catalog dimensions
and source measurements are listed in [`../data/CATALOG_SOURCES.md`](../data/CATALOG_SOURCES.md).
