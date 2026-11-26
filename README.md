# Brick Track Planner

Plan a LEGO train layout that fits your display space. Start with an editable example or add a siding to your club's mainlines, then save your plan and share a parts list.

[Open the planner online](https://vosslab.github.io/brick-track-planner/).

The planner is in pre-production. The online version runs in your browser.
Use the local build below to try the revision in this checkout.

## See a finished plan

The Back-out siding example shows a 60 by 40 inch display. Its two mainlines
are the shared tracks that continue into your neighbors' layouts. The siding
branches off the inner mainline and gives a train a place to park.

<!-- screenshots:begin (managed by screenshot-docs) -->
![The Back-out siding example showing two shared mainlines and one parking track](docs/screenshots/example_bos.webp)
<!-- screenshots:end -->

## Quick start

1. Open the planner and choose **Browse straight examples**.
2. Under **60 &times; 40 inches**, choose the **BOS** drawing for **Back-out siding**.
   The example opens as an editable drawing. Click a piece to select it.
3. Choose **Duplicate plan** to experiment in a second layout tab. Click
   either tab to switch between the two layouts.
4. Choose **Save track plan** to download the active layout as an editable
   LDraw (`.ldr`) file. Use **Open track plan** to continue working on it later.

## Start with your assigned space

1. On the start screen or under **New design**, enter your assigned width,
   depth, and track shape. To make a similar plan, use **60 in**,
   **40 in**, and **Straight**, then choose **Create track plan**.
   Both club mainlines appear.
2. In **Add track**, keep **Arrangement** and **Back-out parking siding**
   selected. Choose **Preview on track** to see where the siding fits.
3. Choose **Add to layout**. The green preview becomes part of your plan.
   You can now save the plan or share a PDF parts list.

Choose **Curve** for one of two illustrated club bends, or **General** to
start with an empty drawing. The screenshot guide shows each starting
point and how to place your first piece. [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md#start-a-plan)

## What you can do next

- **Edit a piece.** Select it to move, rotate, or copy it. When holding a piece,
  click or tap the drawing to put it down. Check **Diagnostics** if it turns red.
- **Edit several pieces together.** Hold **Command** on Mac or **Ctrl**
  elsewhere and drag a box around the pieces. Move or delete them as a group.
- **Explore other plans.** Try **DTS60** for a drive-through siding or **4TRY**
  for a small yard. **Other templates** has curve, yard, and turnaround plans.
- **Check a route and count your parts.** Use **Trace route** to see how a
  train reaches storage. The parts tally counts the actual track pieces.
- **Share a drawing or build sheet.** Export PNG or WebP for a picture, or PDF
  for a layout drawing with the club connections and parts list.

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

- [docs/USAGE.md](docs/USAGE.md) for setup, editing, copying between layouts,
  importing supported BlueBrick plans, and sharing.
- [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md) for first steps, every example,
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
