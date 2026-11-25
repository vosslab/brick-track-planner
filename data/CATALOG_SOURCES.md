# Track catalog sources

[catalog.json](catalog.json) stores measurements and placement recipes for the browser editor.
Coordinates are in studs, with positive x to the right and positive y down in plan view. Port
angles are clockwise from positive x and point out of the part. The part origin is the BlueBrick
bitmap center where an alias is available. The 4DBrix parts use the midpoint of the centerline.
A kit origin is the reference point for its individual part placements. Keep catalog IDs stable
because project files save them.

## Source archives

| Archive                                                                                  | Catalog measurements                                                                                                                          | MD5 of the archive checked         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| [BlueBrick 1.9.2](https://bluebrick.lswproject.com/download/BlueBrick.1.9.2.zip)         | LEGO `parts/Track/` records `2865.8`, `2867.8`, `2861.8`, and `2859.8`                                                                        | `0121736cf112ce8ae322164536f53f38` |
| [BrickTracks 1.1](https://bluebrick.lswproject.com/download/package/BrickTracks.1.1.zip) | `BT S04.8`, `BT S08.8`, `BT R104.8`, `BT R120.8`, separate R104A/R104B records, each turnout body, its stand, and four stand-placement groups | `1ad967b0410498543794e7ded11c3e0d` |
| [TrixBrix 1.8.6](https://bluebrick.lswproject.com/download/package/TrixBrix.1.8.6.zip)   | `tb st8.8`, `tb st32.8`, `tb ct r104.8`, `tb ct r120.8`, and left/right R104 assembled and component records                                  | `b8f3656361628792afb57f2852389a3d` |

The source XML provides connector positions and angles. Its hull points are pixel centers, converted
with eight pixels per stud relative to the image center. Each alias with a custom XML hull keeps
that hull in `sourceHull` for BlueBrick import. The catalog includes original numeric geometry and
omits third-party images and archives. Package credits are on the [BlueBrick downloads page](https://bluebrick.lswproject.com/download.html).

## Embedded LDraw curve models

Native LDraw saves embed the vendor-authored single-model DAT text for the supported BrickTracks
R104 and R120 curves. The source is [Michael Gale's L-Gauge BrickTracks curve pack](https://l-gauge.org/downloads/BricktracksCurvesRev1.0.zip).
The embedded `BrickTracksR104.dat` and `BrickTracksR120.dat` retain their original title, name,
author, `!LDRAW_ORG Unofficial_Part` status, and `Redistributable under CCAL version 2.0` license
notice. The planner bundles the original LDraw records in `data/ldraw/bricktracks_models.json`.
A recipient can open the saved curves with the standard LDraw parts library.

Other catalog track does not claim an unverified manufacturer LDraw model.
Saved files embed generated rails with sleeper slabs from the same measured
centerlines and ports used by the planner. The generated model makes turnouts,
yard components, and compatible straight track recognizable in an LDraw
viewer while retaining the catalog geometry as the authoritative layout data.

## Track geometry

- LEGO RC/PF S16 is straight. The compatible R40 curve sweeps 22.5 degrees.
- BrickTracks and TrixBrix R104/R120 standard curves sweep 11.25 degrees. Their centerlines and
  eight-stud-wide footprints sample circular arcs. Eight parts from each brand form a 90-degree
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
- 4DBrix publishes the dimensions for the four standard-gauge pieces below. The planner uses
  the published radii as centerline radii and builds its own paths and eight-stud footprints
  from those dimensions. The straight product pages describe compatibility with LEGO RC/PF
  track, and the curve pages specify LEGO grid compatibility. The renderer uses the same
  geometry for the palette and layout. The vendor offers STL models under a separate agreement.
  The BlueBrick 4DBrix package covers earlier tracks. Exact BlueBrick aliases and LDraw
  mappings for these four parts remain unverified.
  [4DBrix quarter straight compatibility](https://www.4dbrix.com/products/train/quarter-straight/index.php),
  [4DBrix half straight compatibility](https://www.4dbrix.com/products/train/half-straight/index.php),
  [BlueBrick 4DBrix package list](https://github.com/Lswbanban/BlueBrickParts/blob/master/parts/4DBrix/_partlist.txt)
- `regular` means the rail endpoints share a geometry. It permits mixed-brand
  geometry without making an electrical-compatibility claim. The catalog covers
  RC/PF-compatible plastic track; it intentionally excludes 9V track.

### 4DBrix part dimensions

| Catalog ID    | 4DBrix part                                                                 | Length or radius | Sweep      | Pieces in a 90-degree bend |
| ------------- | --------------------------------------------------------------------------- | ---------------- | ---------- | -------------------------- |
| `4dbrix:s04`  | [2.04.005](https://www.4dbrix.com/products/train/2-04-tracks/005/index.php) | 4 studs long     |            |                            |
| `4dbrix:s08`  | [2.04.001](https://www.4dbrix.com/products/train/2-04-tracks/001/index.php) | 8 studs long     |            |                            |
| `4dbrix:r104` | [2.04.072](https://www.4dbrix.com/products/train/2-04-tracks/072/index.php) | 104-stud radius  | 10 degrees | 9                          |
| `4dbrix:r120` | [2.04.073](https://www.4dbrix.com/products/train/2-04-tracks/073/index.php) | 120-stud radius  | 9 degrees  | 10                         |

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

## Route metadata

Each catalog part names the connector pairs that a train may follow in
`routes`. Routes point to the matching rendered centerline in `paths`. They
keep a turnout or crossover from becoming an unrestricted junction.

The R40 and R104 double crossovers, R40 and R104 triple switches, R104 wye,
four-track right yards, and R56 double pass-through are based on the
corresponding TrixBrix products and BlueBrick 1.8.6 connection records. A
multi-piece product is catalogued as an arrangement kit of its installed
pieces, rather than as a fictional single track part. This keeps its inventory
and physical footprint honest while still making the product available as one
placement action.

The R40 double crossover has five purchasable elements: four independently
switchable turnout sections and one central crossover. BlueBrick's `tb double
crossover r40 complete.8` record supplies the measured four exterior ports at
16-stud centers over a 48-stud length and the four permitted routes. Its source
does not publish the precise internal module joints. The planner therefore
models the measured complete installation and keeps the five-element bill of
materials in `inventory`; it does not invent component poses or mistake the
different standalone `tb crossing r40.8` curved-cross product for this center.
[TrixBrix R40 double crossover](https://trixbrix.eu/en/p/track/switches-and-crossovers/crossover-r40/9903-crossover-r40)

The R56 double pass-through keeps the center line isolated and connects only the two outer lines, as specified by [TrixBrix](https://trixbrix.eu/en/p/track/switches-and-crossovers/double-pass-through-crossover-r56/11096-double-pass-through-crossover-r56).

The BlueBrick R40 triple-switch source provides only the complete installed record,
whose four rail ends and three routes are measured directly. TrixBrix lists that
product as six physical elements: base, detachable section, two R40 half curves,
and two connector halves. The catalog keeps the source body atomic for geometry
and inventory (base plus detachable section), then uses the measured parallel
group poses for its two connectors and two half curves. It does not invent
individual body-component transforms.
