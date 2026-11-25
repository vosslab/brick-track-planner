# Track catalog sources

[catalog.json](catalog.json) stores measurements and placement recipes for the browser editor.
Coordinates are in studs, with positive x to the right and positive y down in plan view. Port
angles are clockwise from positive x and point out of the part. The part origin is the BlueBrick
bitmap center where an alias is available. A kit origin is the reference point for its individual
part placements. Keep catalog IDs stable because project files save them.

## Source archives

| Archive | Catalog measurements | MD5 of the archive checked |
| --- | --- | --- |
| [BlueBrick 1.9.2](https://bluebrick.lswproject.com/download/BlueBrick.1.9.2.zip) | LEGO `parts/Track/` records `2865.8`, `2867.8`, `2861.8`, and `2859.8` | `0121736cf112ce8ae322164536f53f38` |
| [BrickTracks 1.1](https://bluebrick.lswproject.com/download/package/BrickTracks.1.1.zip) | `BT S04.8`, `BT S08.8`, `BT R104.8`, `BT R120.8`, separate R104A/R104B records, each turnout body, its stand, and four stand-placement groups | `1ad967b0410498543794e7ded11c3e0d` |
| [TrixBrix 1.8.6](https://bluebrick.lswproject.com/download/package/TrixBrix.1.8.6.zip) | `tb st8.8`, `tb st32.8`, `tb ct r104.8`, `tb ct r120.8`, and left/right R104 assembled and component records | `b8f3656361628792afb57f2852389a3d` |

The source XML provides connector positions and angles. Its hull points are pixel centers, converted
with eight pixels per stud relative to the image center. Each alias with a custom XML hull keeps
that hull in `sourceHull` for BlueBrick import. The catalog includes original numeric geometry and
omits third-party images and archives. Package credits are on the [BlueBrick downloads page](https://bluebrick.lswproject.com/download.html).

## Track geometry

- LEGO 9V S16 and the R40 turnout through routes are straight. The standard R40 curve sweeps
  22.5 degrees. LEGO 9V aliases carry the source XML's preferred height of -8 LDraw units.
- BrickTracks and TrixBrix R104/R120 standard curves sweep 11.25 degrees. Their centerlines and
  eight-stud-wide footprints sample circular arcs. Four parts from each brand can form a 90-degree
  bend of either radius. The products describe the radius at the centerline.
  [BrickTracks R104 curve](https://bricktracks.com/products/r104-curve-x8-pf),
  [TrixBrix R120 curve](https://trixbrix.eu/en/p/track/curved-tracks/curved-track-r120/9920-curved-track-r120)
- The R104A and R104B adapter curves keep their own source connector offsets. Turnout branches
  and adapters use sampled paths interpolated between the source positions and tangents. Their
  footprints come from the source hulls when available. Straight footprints span their measured
  mating planes and the eight-stud track width.
- The catalog uses TrixBrix S8 and S32, which have corresponding regular-gauge records in both the
  part archive and vendor listings. The TrixBrix R120 entry represents one installed 11.25-degree
  section. The vendor describes two printed pieces per section. The placement unit follows the
  package's complete section alias.
  [TrixBrix straight track listing](https://trixbrix.eu/en/c/track/straight-tracks),
  [TrixBrix R120 full-circle set](https://trixbrix.eu/en/p/track/curved-tracks/curved-tracks-r120/curved-track-r120-comma-32x-comma-full-circle/9969-curved-track-r120-comma-32x-comma-full-circle)
- `regular` means the rail endpoints share a geometry. The geometry permits mixed brands without
  determining whether a layout conducts power for a 9V train.

## R104 turnout assemblies

BrickTracks' four BlueBrick groups locate one left or right body and one reversible stand.
BlueBrick measures each group's child positions from its display hull center. The catalog
expresses the stand's inside or outside pose relative to the turnout body's bitmap center.
`sourceOffset` shifts the center of BlueBrick's generated group sprite to that same body origin.
The stand footprint uses its 24-by-55-pixel source image bounds, about 3 by 6.875 studs.
The stand contacts are mechanical hooks. The rail ports are common, through, and branch.
[BrickTracks R104 switch documentation](https://bricktracks.com/products/r104-switch-track-kits)

Each TrixBrix turnout uses four placed parts: one base, two detach sections, and one S8 straight.
The assembled aliases `tb switch r104 left.8` and `tb switch r104 right.8` provide the installation's
three external rail ports. The component records provide positions and orientations for the
keyed internal joints. The through port of detach 1 is eight studs before the assembled turnout
end, at local (1.875, -10) on the left version and (-1.875, -10) on the right version. BlueBrick's
standalone detach 1 records put the virtual exit at y = -18, at the assembled through exit.
The matching detachable branch joint uses the coordinates in the archive's `triple detach 2`
records. Component footprints are approximate top-down envelopes calibrated against the assembly
and component sprites. The base includes the ground throw in its outline. The two detach parts
are saved as individual project parts, and the complete turnout aliases import the whole recipe.
[TrixBrix left R104 turnout](https://trixbrix.eu/en/p/track/switches-and-crossovers/switches-and-crossovers-r104/left-switch-r104/9941-left-switch-r104),
[TrixBrix right R104 turnout](https://trixbrix.eu/en/p/track/switches-and-crossovers/switches-and-crossovers-r104/right-switch-r104/9951-right-switch-r104)
