# Related projects

Brick Track Planner helps LEGO train builders fit track to an assigned display
area, connect to shared mainlines, and pass a drawing and parts list to the club.

## Confirmed related projects

### BlueBrick

- **Companion and interoperability tool.** [BlueBrick project](https://github.com/Lswbanban/BlueBrick)
- Plan a full show drawing with separate layers for track, tables, baseplates, and labels.
- Bring supported track from a BlueBrick `.bbm` file into Brick Track Planner to work
  on a member's section. [USAGE.md](USAGE.md#save-and-export)

### L-Gauge

- **Domain resource.** [L-Gauge CAD libraries](https://l-gauge.org/wiki/index.php/CAD_Tools)
- Look up curve and switch dimensions in studs and degrees, or download parts
  for BlueBrick and LDraw. [Track geometry reference](https://l-gauge.org/wiki/index.php/Track_Geometry)
- The planner's color-coded view draws on the L-Gauge schematic palette. The
  L-Gauge BrickTracks curve pack supplies models for saved plans.
  [USAGE.md](USAGE.md#edit-and-inspect), [FILE_FORMAT.md](FILE_FORMAT.md#track-placement)

### LDraw

- **Domain standard.** [LDraw file format specification](https://www.ldraw.org/article/218.html)
- View the track model from a saved `.ldr` plan in an LDraw-compatible tool.
- Brick Track Planner saves part placements as LDraw references and stores its
  editing information in additional records. [FILE_FORMAT.md](FILE_FORMAT.md#track-placement)

## Possible related projects

### BrickLayouts

- **Direct alternative (likely).** [BrickLayouts](https://www.bricklayouts.com/)
- In a browser, assign sections to builders and plan how track, baseplates, and
  scenery fit together on the full show floor.
- The project's collaborative display guide shows builder assignments, display
  layers, and custom shapes.

### Your Tracks

- **Direct alternative (likely).** [Your Tracks on the App Store](https://apps.apple.com/us/app/your-tracks/id6761334460)
- Build a layout on an iPhone or iPad, run a simulated train, and preview the
  layout at actual size on the floor with augmented reality.
- The developer's listing also documents a track parts list and PNG export.

### Tracks!

- **Direct alternative (likely).** [Tracks! browser planner](https://www.wirelesscouch.net/tracks/)
- Sketch a layout with standard LEGO 9V pieces and save it as a `.tracks` file.
- The author's repository documents the 9V library and names Train Depot Track
  Designer as its inspiration. [Tracks! source and parts library](https://github.com/cluening/tracks)

### SCARM

- **Direct alternative (likely).** [SCARM](https://www.scarm.info/index.php?l=en)
- Plan LEGO train layouts in a desktop CAD tool with a 3D view and a printable
  parts list.
- The developer lists 4.5V, 9V, and RC Lego libraries and publishes a gallery of
  LEGO track plans. [SCARM LEGO track plans](https://www.scarm.info/layouts/track_plans.php?tracks=Lego)

### XTrkCAD

- **Direct alternative (possible).** [XTrkCAD project wiki](https://sourceforge.net/p/xtrkcad-fork/wiki/Home/)
- Lay out LEGO track in a general-purpose model railway CAD tool.
- The project's library documentation lists `Lego-Track.xtp` among the included
  track definitions. [XTrkCAD parameter files](https://sourceforge.net/p/xtrkcad-fork/wiki/ParameterFile/)

### 4DBrix nControl

- **Same-workflow implementation (likely).** [4DBrix nControl](https://www.4dbrix.com/products/monorail/ncontrol/)
- Design a train or monorail layout, check the required pieces against your
  inventory, and simulate switch and sensor behavior.
- 4DBrix documents support for both LEGO and 4DBrix track and explains how the
  plan can be used with its automation hardware.

### Bill Ward's track geometry

- **Domain resource (likely).** [Track Layout Geometry](https://www.brickpile.com/articles/track-layout-geometry/)
- Use the illustrated crossover, S-bend, and yard examples to understand how
  standard straights, curves, and switches line up on the stud grid.
- Ward's diagrams show where substituting a straight for two curves can shorten
  a route or preserve parallel track spacing.

### Train Depot Track Designer

- **Prior art (likely).** [Train Depot Track Designer](https://www.diesel-dave.com/lego/train_depot/td.htm)
- See how an early LEGO train planner reported track counts, space requirements,
  and potential short circuits for 9V layouts.
- The program documentation records the original 1997 release and its Windows 95
  target.

## Evidence notes

LEGO UK Railway's guide collects track planners and geometry references and
shows how a club uses BlueBrick to draw a show layout.
[LEGO UK Railway's track planning software guide](https://www.lukrailway.co.uk/news/lego-track-planning-software-a-guide-by-lego-train-nerds/)

The project pages and author documentation support the individual feature
descriptions. Brick Track Planner's own documentation records the BlueBrick
import, L-Gauge sources, and LDraw file format.
