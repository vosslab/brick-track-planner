# File formats

V1 defines `.btp.json` as the native project format. The current version 1 project shape is modeled
and validated in [`src/project.ts`](../src/project.ts). The fixture-backed BlueBrick v9 importer is
in [`src/project_files.ts`](../src/project_files.ts).

## Native projects

The version 1 project has `name`, `layers`, `tables`, `items`, and `seams` fields. Tables and items
use `x`, `y`, and `angle` poses. Items can be track, baseplate, or unresolved source objects. Track
items store `partId` and an integer `heightPlates`; seams store persistent outer and inner port
pairs.

The parser requires version `1`, unique IDs within each ID namespace, valid referenced layer and
table IDs, and finite pose values. Table and item IDs share one unique namespace for editor
selection; layer IDs and seam IDs have separate namespaces. Project data stays in the browser
workflow; v1 does not include server-side project storage or accounts.

Each stored pose origin must be within -100,000 to +100,000 studs on both planar axes. Table and
unresolved-item width and depth must be positive and at most 100,000 studs. These checks apply to
stored values individually; they do not cap the combined layout or exported drawing bounds.

Native project files are parsed and validated before opening replaces the current layout. If parsing
or validation fails, the current layout remains open and the editor reports the error.

## BlueBrick import

V1 import support is limited to behaviors covered by the BlueBrick v9 fixture
[`bluebrick-example.bbm`](../examples/bluebrick-example.bbm). The importer accepts plain BlueBrick
Map v9 XML up to 8 MiB, with at most 1,000 layers, 10,000 source bricks, 1,000 tables, and 10,000
expanded project items. It rejects document type declarations. Source placeholders map to
unresolved items, and layer visibility maps to project layers. Unsupported layer types are reported
as warnings; unsupported pieces remain as unresolved items.

Source `Altitude` values are mapped using each alias's `preferredY` calibration. The fixture's LEGO
alias `2865.8` has `preferredY` -8 LDraw units: source altitude 0 maps to baseline, -16 maps to +1
plate, and -12 maps to a fractional 0.5 plate and remains unresolved. A whole plate is 8 LDraw units
(3.2 mm).

The supported straight aliases include BrickTracks `BT S04.8` and `BT S08.8`, plus TrixBrix `tb
st8.8` and `tb st32.8`. BlueBrick `SET R104 TURNOUT LEFT` and `SET R104 TURNOUT RIGHT` records
remain unresolved by design; they are distinct from the supported assembled BrickTracks and TrixBrix
left/right R104 turnout aliases.

Changing track alignment or repairing seam endpoints clears any open turnout swap preview. Recheck
the proposed swap after those edits before applying it.

The swap selector supports same-brand single-body turnouts with at least three regular ports and a
`common` port. It preserves the position and heading of that common connector. LEGO and BrickTracks
turnout bodies meet this rule. TrixBrix R104 turnouts are multi-part assemblies of a base, two
detach pieces, and an S8 straight; place, import, and move them as assemblies. The editor does not
offer a base-only swap, which would leave a mixed TrixBrix turnout.

## Exports

The sharing controls export PNG, WebP, and PDF; LDraw exports track-only models. The LDraw export
includes visible mapped track only, excludes tables and scenery, and reports visible unsupported or
unresolved pieces.

The LDraw coordinate transform uses a right-handed CAD top view: planner X maps to LDraw X, and
planner down-Y maps to negative LDraw Z. The calibrated per-part model Y is then reduced by 8 LDraw
units for each positive `heightPlates` value. For source aliases, catalog `preferredY` supplies the
BlueBrick source placement altitude when present.

PNG and WebP include the complete visible scene. Their raster dimensions scale proportionally with
the scene and cap the longest side at 2,400 pixels. The PDF fits that same complete scene to the
page and includes the visible inventory. In the setup scene, filled diamonds mark joined seam ends,
open circles mark open ends, and outlined diamonds mark ambiguous joins. These are pixel and page
size limits; exports do not impose a separate stud-coordinate cutoff.

The export mapping in [`src/ldraw.ts`](../src/ldraw.ts) covers official LEGO 9V S16 (`74746.dat`),
R40 (`74747.dat`), right (`75541c01-f1.dat`), and left (`75542c01-f1.dat`) pieces, plus BrickTracks
R104/R120 (`BrickTracksR104.dat` and `BrickTracksR120.dat`). Use the LDraw Complete Library version
2025-08 or newer and Michael Gale's
[BrickTracks curve bundle](https://l-gauge.org/downloads/BricktracksCurvesRev1.0.zip).
The bundle relies on standard library `stud.dat` and `s/2865s02.dat`, `s/2865s03.dat`, and
`s/2865s04.dat` assets. The
[official LDraw 2025-08 update](https://library.ldraw.org/updates/view2508)
lists the 75541/75542 switch IDs. Confirm mappings against the
[official LDraw parts library](https://library.ldraw.org/parts/list?tableSearch=74746.dat) and the
[LDraw file format](https://www.ldraw.org/article/218.html).

Studio is not part of v1 verification; inspect the export with an LDraw reader and the documented
library assets.

See the [active v1 plan](active_plans/active/BRICK_TRACK_PLANNER_V1.md) for scope and fixture
requirements.
