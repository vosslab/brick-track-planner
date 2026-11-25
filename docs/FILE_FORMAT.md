# File format

The planner saves editable projects as `.btp.json`. Version 2 stores a whole layout or show;
version 1 files still open and are migrated in memory by [`src/project.ts`](../src/project.ts).
Reusable section snapshots use `.btps.json` and the envelope implemented in
[`src/section_files.ts`](../src/section_files.ts).

## Whole-show projects

The required version 2 project keys are `version`, `name`, `sections`, `members`, `layers`,
`tables`, `items`, and `seams`. `venue` is optional. Every collection is an array, including an
empty one. The parser validates unique IDs within their groups, references, finite poses, positive
dimensions, and whole-plate track heights before replacing the open project. A rejected file
leaves the current layout open.

Version 1 has `name`, `layers`, `tables`, `items`, and `seams`. Opening one preserves its existing
tables, items, and seams, then adds a local section for its tables and an empty member list. Existing
tables are not tagged for NILTC checks; those checks remain opt-in. Version 2 also has optional
metadata: a venue, a table's `nominal` size and `niltc` mode, track `ballast` style and
`countBallast`, baseplate name and color, and unresolved-item source altitude. These fields do not
replace geometry or track height.

Poses use continuous stud coordinates and degrees. Each table and item has an `id`, `x`, `y`,
`angle`, and `layerId`; items also have a `kind`. Track items require `partId` and integer
`heightPlates`; baseplates can store `name` and six-digit hex `color`; unresolved items retain
their source ID, name, dimensions, and reason. Table and item IDs share a namespace. IDs in other
groups are unique within their group. Coordinates are bounded to +/-100,000 studs; table and
unresolved-item width and depth must be positive and no more than 100,000 studs. These checks apply
to each stored value, not to combined layout or export bounds.

Track appearance and material counting are separate from placement. `ballast` selects `bare`,
`gray`, or `pennlug`; `countBallast: true` opts a track item into a published recipe when one is
available. Recipe gaps remain visible in the inventory and setup packet. `heightPlates` is the
integer physical height used by fit checks and LDraw placement; appearance and recipes do not
change it. See [`data/ballast_recipes.json`](../data/ballast_recipes.json).

## Reusable section bundles

A `.btps.json` file has this version 1 envelope:

```json
{
  "version": 1,
  "section": { "name": "Yard", "ownerName": "Member name" },
  "anchorTableId": "yard-table",
  "project": {
    "version": 2,
    "name": "Yard",
    "sections": [{ "id": "yard", "name": "Yard", "exits": [] }],
    "members": [],
    "layers": [{ "id": "layout", "name": "Layout", "visible": true }],
    "tables": [{
      "id": "yard-table", "name": "Yard table", "layerId": "layout",
      "sectionId": "yard", "x": 0, "y": 0, "angle": 0,
      "width": 128, "depth": 128, "fronts": []
    }],
    "items": [],
    "seams": []
  }
}
```

`ownerName` is optional. The project fragment must contain exactly one section, no venue or
member records, and only that section's tables, attached items, layers, and internal seams. Its
anchor table starts at `(0, 0)` with angle `0`. Export positions in the fragment relative to that
anchor. Import places the anchor at the chosen pose and assigns fresh IDs. Loose layout items are
left in the source project and reported as a warning; attach them to a table before sharing if they
belong to the section.

## Other imports and exports

BlueBrick import supports the fixture-backed Map v9 subset described in
[`src/project_files.ts`](../src/project_files.ts); unsupported pieces remain unresolved and the
import preview reports warnings. The native opening and export controls are implemented in
[`src/editor_files.ts`](../src/editor_files.ts).

PNG and WebP export the complete visible scene. Standard raster export targets a 2,400-pixel long
side and High targets 4,096 pixels, subject to a 12-megapixel cap. PDF includes the scene and
inventory, with Color and Grayscale modes. LDraw exports visible mapped track only; it omits
tables, baseplates, scenery, unresolved objects, and track without a mapping, and reports omitted
pieces and required custom files. Mappings are limited to official LEGO 9V S16, R40, and right/left
switch files plus BrickTracks R104/R120. It does not export TrixBrix track, most switch kits,
tables, or ballast. See [`src/ldraw.ts`](../src/ldraw.ts) and
[`src/share.ts`](../src/share.ts).
