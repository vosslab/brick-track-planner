# Brick Track Planner v1 progress

The approved plan defines the milestone exit checks. [BRICK_TRACK_PLANNER_V1.md](BRICK_TRACK_PLANNER_V1.md)

## Dispatch and evidence

The table records implementation, independent review, and milestone evidence for the verified
GitHub Pages artifact.

| Milestone | Implementation and review | Evidence |
| --- | --- | --- |
| M1 Build and geometry slice | `build`, `engine`, `ui`. Spec review by `review_build_spec`. | The staged site loads Wasm and the examples by relative URL at `/brick-track-planner/`. Browser tests combine native save/reopen with the seam edit and undo flow. |
| M2 Catalog and IDs | `catalog_impl`, `files`. Spec review by `review_geometry_spec`. | Checked source-derived geometry, separate quarter-circle aliases, and all four BrickTracks stand variants. The BlueBrick comparison matches each two-piece assembly's parts, pose, and rail endpoints against the equivalent grouped source, and compares the placed kit to the same import. Checked both TrixBrix kit recipes for four physical pieces and their assembled ports. |
| M3 Section contract and examples | `contract`, `ui`. Spec review by `review_geometry_spec`. | Both native examples serialize with table-local poses and the seam contract. The mixed-brand corner has seven joins per route, exits at the four east and south guides, and north and west fronts after reopen. |
| M4 Editing and bindings | `ui`. Spec review by `review_ui_spec`. Quality review by `review_core_quality`. | The siding edit keeps both mainline pairs while the TrixBrix R104 snaps to the turnout branch. Desktop checks move two pieces rigidly, preserve the common connector during a turnout swap, and keep the seam bindings. Geometry regressions distinguish equivalent rigid snaps from ambiguous choices and flag wrongly owned seam endpoints for repair. |
| M5 Seam and footprint checks | `engine`. Spec review by `review_geometry_spec`. Quality review by `review_core_quality`. | A two-stud shift gaps both pairs and exposes the S8 strip. Undo restores both joins, support, and the 11-piece inventory. Raising the S8 one plate shows an inner height mismatch. Native and staged Wasm agree within `1e-6` stud on the independent fixture checks. |
| M6 BlueBrick and project files | `files`, `contract`, `ui`. Spec review by `review_files_spec`. | The stock `TABLE96X64` example checks layer order and visibility, a rotated turnout, an unknown part, and the `2865.8` altitude cases. Invalid or canceled import preserves the current layout. Saving and reopening the imported project in a fresh context preserves unresolved data and recomputes diagnostics. |
| M7 Touch and desktop workflow | `ui`, `browser_tests`. Spec review by `review_ui_spec`. | The editor checks rotate and correct Table B, create a seam with the S8's actual endpoint beyond Table A, and repair a missing connector after its piece is deleted. Touch checks use narrow phone emulation and actual tap input. |
| M8 PNG and WebP sharing | `drawing`, `browser_tests`. Spec review by `review_files_spec`. | The export check decodes both image formats after zooming the editor in and verifies full-layout framing. Forced WebKit canvas fallback produces a decodable Wasm-encoded WebP. |
| M9 PDF setup sheet | `drawing`, `browser_tests`. Spec review by `review_files_spec`. Grayscale review by `release_audit` and the manager. | The landscape US Letter PDF includes the layout and inventory. Independent grayscale inspection identified both north fronts, Table A as the S8 supplier, and the bring list of seven LEGO S16s, two BrickTracks S8s, one BrickTracks R104 turnout body, and one stand. |
| M10 LDraw export | `cad`. Spec review by `review_geometry_spec`. | Independent reference-model calibration confirmed the mapped turnout, straight, and wide curve coupling points and turnout handedness. Raising the turnout one plate changes only Y by -8 LDU. Export reports omissions and custom-model requirements. |
| M11 Release artifact | `build`, `browser_tests`, `docs`, `release_docs`. Independent integration review by `release_audit`. | A clean source snapshot with no generated inputs passed `npm ci` and `./devel/verify_release.sh`. The gate staged and tested the artifact at `/brick-track-planner/` and retained image, PDF, and LDraw outputs. The root Pages workflow awaits manual activation on GitHub. |

The named release examples are [two-section.btp.json](../../../examples/two-section.btp.json),
[double-corner.btp.json](../../../examples/double-corner.btp.json), and
[bluebrick-example.bbm](../../../examples/bluebrick-example.bbm).

The full gate passed 15 Rust tests, 13 TypeScript tests, and 19 Playwright checks. The repository's
separate Python suite passed 1,004 checks. The four intentional Playwright skips cover two
opt-in timing runs, a redundant native/Wasm check on touch, and the desktop-only swap and group move
check. Desktop Chromium and narrow touch Chromium exercise the editor. The touch workflow targets
phones such as the iPhone and uses Playwright's Pixel 7 profile. WebKit uses the desktop Safari
profile for project files and export checks.

Core quality findings led to unique table/item IDs, bounds shared across both runtimes, seam
endpoint ownership checks, and adaptive port ordering. The isolated Node Wasm geometry benchmark
for 1,000 north-south S16s improved from 19.10 ms to 1.47 ms p95 with identical result JSON.

## Browser timing and size

The staged-browser benchmark used one worker and 20 samples per scene after five warmups.

| Scene | Geometry p95 | Update through SVG layout p95 |
| --- | --- | --- |
| 1,000 pieces, desktop Chromium | 2.90 ms | 28.90 ms |
| 300 pieces, touch Chromium | 1.00 ms | 9.50 ms |

Both geometry results meet the 8 ms diagnostic target. The 300-piece touch scene meets the
16.7 ms update target. The 1,000-piece desktop scene exceeds it.

The staged artifact totals 1,590,664 uncompressed bytes, or 5,481,509 bytes with source maps.
The entry JavaScript is 67,928 bytes plus a 1,164-byte shared chunk, CSS is 11,424 bytes, and
Wasm is 671,023 bytes. The PDF library loads on demand.

## Shared decisions

- TypeScript owns committed state and undo. The Rust adapter evaluates a project and optional
  snap proposal without retaining project state and returns an analysis and resulting project.
- Coordinates are studs with X right, Y down, and clockwise angles. Table origins use the local
  northwest corner. Items attached to a table store local poses. Unattached items use world
  poses. Baseplates are centered on their pose and may preserve a source RGB color.
- Seams persist separate outer and inner pairs with stable piece and connector references.
  Missing references stay actionable. The native two-section fixture uses a BrickTracks S8
  owned by the supplying table and an inner join eight studs past the tabletop seam. The
  receiving section's two-stud move must expose the S8 strip and open both joins.
- Geometry and inventory operate on visible items. A table's hidden layer does not itself
  hide items on other layers. An intended seam is inactive if a bound layer or section is
  hidden. Existing join recognition uses 0.05 stud and 0.25 degrees.
- Turnout swap preview covers single-body LEGO and BrickTracks turnouts. TrixBrix turnout
  recipes place or import the four physical pieces, which can move together as a selection.
- Catalog data and examples are checked-in build inputs. The Wasm binary and examples are
  served at relative paths under the Pages project subpath. The release command is
  `./devel/verify_release.sh`. The Pages publication seed stays inactive.
- Artifact verification runs before Pages activation. Studio import and club pilot layouts are
  optional follow-ups to the local release checks.

## Pilot layout note

> The project will create small test layouts to check BlueBrick import, mixed-brand track connections, table fit, parts counts, and save/reopen. Steve&rsquo;s yard and Mark&rsquo;s siding are optional club pilot layouts if they become available.
