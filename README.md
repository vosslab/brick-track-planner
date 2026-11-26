# Brick Track Planner

Design your LEGO train club display around the tracks it must connect to. Start with the NILTC mainlines, fit a siding or yard in your assigned space, and trace a train's route through the pieces you'll build with.

[Open the hosted planner](https://vosslab.github.io/brick-track-planner/).

This pre-production browser editor keeps member layouts in tabs with one drawing visible. The
hosted editor follows the deployed revision. Use the local build to try this
checkout.

## From display space to siding

A 60 by 40 inch straight assignment starts with two connected mainlines. The
parking siding preview shows where the turnout fits and how much straight
storage track the space allows.

<!-- screenshots:begin (managed by screenshot-docs) -->

![Start screen for entering a member's assigned display area](docs/screenshots/member_design_start.webp)
![A 60 by 40 inch member plan with a parking siding connected behind the mainline](docs/screenshots/member_parking_siding.webp)
<!-- screenshots:end -->

## Quick start

1. Set the width to **60 in** and depth to **40 in**, keep **Straight**, and
   select **Create track plan**. Both club mainlines appear.
2. Under **Add track**, keep **Arrangement** and **Back-out parking siding**.
   Select **Preview on track** to see the replacement track and the available
   storage length.
3. Select **Add to layout**, then **Save track plan**. The editable LDraw
   download opens again from **Open track plan**.

For a shorter siding, open **Placement options**, set **Extra storage track** to
**32 studs** or **No added straights**, and preview again.

## Choose a starting layout

- **Browse straight examples** opens editable 60 by 40 inch and 40 by 40 inch
  plans. Try **DTS60** for a drive-through siding with 80 studs of straight
  storage, or **PT40**, **TJ40**, and **TJ56** for three junction examples.
- **Curve** offers two illustrated bends using R120 on the outside and R104 on
  the inside. **General** starts with an empty design area.
- **Other templates** includes the [R104 yard](templates/member-yard.ldr) and
  two same-edge turnarounds, the
  [R104 semicircle return](templates/r104-semicircle-return.ldr) and
  [R120 corner return](templates/r120-corner-return.ldr).

Use **Trace route** to check how a train reaches storage. The parts tally
counts the individual track pieces. Export a PNG or WebP drawing, or a PDF
build sheet with the club handoffs and parts list. Import a supported BlueBrick
Map v9 as a reviewable plan with unfamiliar parts marked on the drawing.

## Run the local editor

Use Node.js 26 with npm 12, Python 3, stable Rust, and `wasm-pack`. The
[Brewfile](Brewfile) lists macOS packages.

```bash
rustup target add wasm32-unknown-unknown
npm ci --no-audit
source source_me.sh && ./run_web_server.sh
```

Open the local address printed by the server and follow the quick start.
For development, `./devel/verify_release.sh` checks Rust, builds the Pages
site, and runs the TypeScript, Node, and browser checks. Run
`source source_me.sh && python3 -m pytest tests/` for repository hygiene checks.

## Documentation

- [docs/USAGE.md](docs/USAGE.md) for setup, arrangement fit, editing, and sharing.
- [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md) for every example, the blank editor,
  and a first-track placement demo.
- [NILTC track specifications](docs/references/niltc-track-specifications/index.html)
  for the club straight and corner diagrams.
- [data/CATALOG_SOURCES.md](data/CATALOG_SOURCES.md) and
  [data/BALLAST_SOURCES.md](data/BALLAST_SOURCES.md) for measured parts and build references.
- [docs/FILE_FORMAT.md](docs/FILE_FORMAT.md) for saved plans and import behavior.
- [docs/GEOMETRY_MODEL.md](docs/GEOMETRY_MODEL.md) for track joins and route checks.

## License

Source code uses [AGPL-3.0](LICENSE.AGPL-3.0). Original documents, screenshots,
and other creative material use [CC BY 4.0](LICENSE.CC-BY-4.0).
