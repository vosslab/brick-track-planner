# Brick Track Planner

Plan the track in your LEGO train club display space. Start with the assigned NILTC straight or corner, then connect a parking siding or storage yard and trace a train's route back to the mainline.

[Open the published planner](https://vosslab.github.io/brick-track-planner/).
This project is in pre-production.

## From assigned area to siding

Choose **Browse straight examples** on the start screen to compare layouts
for 60 by 40 inch and 40 by 40 inch displays. Pick a drawing to open its
editable track plan.

Start with the space you signed up for. For example, choose 60 inches along
the track and 40 inches from the plexiglass, then choose **Create track plan**.
The planner adds the assigned mainline and covers the whole area with its
baseplate grid. The second view shows a connected parking siding behind that
mainline.

<!-- screenshots:begin (managed by screenshot-docs) -->

![Start screen for entering a member's assigned display area](docs/screenshots/member_design_start.webp)
![A 60 by 40 inch member plan with a parking siding connected behind the mainline](docs/screenshots/member_parking_siding.webp)
<!-- screenshots:end -->

[See every example layout, the blank editor, and a first-track demo](docs/SCREENSHOTS.md).

## Quick start

1. On the start screen, choose the width along the track and the depth from the
   plexiglass. For a 60 by 40 inch straight display, choose **60 in** and
   **40 in**, keep **Straight**, and choose **Create track plan**.
2. In **Add track**, keep **Arrangement** and **Back-out parking siding**.
   Choose **Preview on track**. The preview highlights the connected fit and
   says how much storage track fits in the assigned area.
3. Choose **Add to layout**. Select **Single piece** only when you want to
   extend an open rail end yourself. Save with **Save track plan** when ready.

For a shorter siding, open **Placement options** before previewing and
choose 32 or 0 studs of added straight storage.

Choose **Open track plan** to continue a saved LDraw file. For a corner assignment, choose
**Curve** and pick the drawing of the top-left or top-right corner. The starter
uses R120 on the outside and R104 on the inside. Use the rotate button beside
**Fit view** to turn the drawing. Choose **General** to lay your own track on a
covered area.

## Plan a larger yard

- To bring trains in at one end and out the other, start a 100 by 60 inch
  straight assignment and preview **Four-track drive-through yard**. With
  64 studs of storage, use **Fit location** to choose where both ends join.
- For a terminal track at the back of a 60 by 40 inch display, **Rear parking
  siding** uses seven R40 curves and the full 40 inch depth. The library also
  includes double crossovers, triple switches, and R104 wyes.
- Choose a mainline exit in **Trace from**, then choose **Trace route** and
  click a storage track connector. Check the highlighted route, the parts tally,
  and any findings about joins, height, or track outside the design area.
- NILTC checks require 16 studs of straight between mainline events such as
  curves or switches, and 64 studs after an S-curve. R40 and R56 curves can serve
  private yards. The catalog covers plastic RC/PF-compatible LEGO, BrickTracks,
  and TrixBrix track.

Use **Other templates** on the first screen or in the editor for these larger
or differently shaped assignments. You can also download the LDraw files for
[straight mainline](templates/member-straight.ldr), [corner](templates/member-corner.ldr),
[yard](templates/member-yard.ldr), [R104 semicircle return](templates/r104-semicircle-return.ldr),
and [R120 corner return](templates/r120-corner-return.ldr). The two turnarounds
bring a train back to the same boundary on the other track.

## Save, import, and share

Export a PDF build sheet for the show with the public edge, mainline exits,
track drawing, and parts list. PNG and WebP export the drawing. Share the
same `.ldr` file with an LDraw user. The planner reopens its own track plans
and templates. Importing a supported
BlueBrick Map v9 `.bbm` keeps unrecognized pieces visible for review.

## Run the current build

From a checkout, use Node.js 26 with npm 12, stable Rust, the
`wasm32-unknown-unknown` target, and `wasm-pack`. On macOS the
[Brewfile](Brewfile) lists the tools for `brew bundle`.

```sh
rustup target add wasm32-unknown-unknown
npm ci --no-audit
./run_web_server.sh
```

Open the local address printed by the server and follow the quick start above.
For development, `./devel/verify_release.sh` runs the Rust checks, builds the
Pages site, and runs the TypeScript, Node, and browser checks.
Run `source source_me.sh && pytest tests/` for the repository checks.

## Documentation

- [Member guide](docs/USAGE.md) for signup dimensions, arrangements, and route tracing.
- [Offline NILTC track specifications](docs/references/niltc-track-specifications/index.html) for the straight and corner diagrams.
- [Track catalog sources](data/CATALOG_SOURCES.md) and [ballast references](data/BALLAST_SOURCES.md) for individual parts and assemblies.
- [Geometry model](docs/GEOMETRY_MODEL.md) for connectors and route calculations.
- [File format](docs/FILE_FORMAT.md) for project files and import behavior.

## License

Source code uses [AGPL-3.0](LICENSE.AGPL-3.0). Original documents, screenshots,
and other creative material use [CC BY 4.0](LICENSE.CC-BY-4.0).
