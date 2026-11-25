# Whole Show fixture geometry

This historical plan describes the retired section-bundle design. The current
planner uses [editable LDraw track templates](../FILE_FORMAT.md).

The archived assembled show fixture contained eight nominal 40 by 40 in
tables in a 576 by 320 stud venue. The footprint spans (32, 32) to (544, 288), leaving a
32-stud margin on all sides. Coordinates increase to the right and down. The quarter-circle
`corner.btps.json` repeated with quarter turns. `siding.btps.json` contained two tables with
a joined internal seam. `yard.btps.json` and `connector.btps.json` each contained one table.

```text
                     x=160       x=288       x=416
           x=32        |           |           |        x=544
    y=32     +---------+-----------+-----------+----------+
             | NW      | Yard      | Connector | NE       |
             |         |           |           |          |
   y=160     +---------+-----------+-----------+----------+
             | SW      | Siding    | Siding    | SE       |
             |         | West      | East      |          |
   y=288     +---------+-----------+-----------+----------+
```

Each row below gives the world position and outward angle of both lanes on a named exit. The
exit suffix names the edge in the table's local orientation.

| Show join | Named exits in table-local terms | Outer (x, y) | Inner (x, y) | Outward angles |
| --- | --- | --- | --- | --- |
| Northwest / Yard | `northwest-east`, `yard-west` | (160, 40) | (160, 56) | 0 / 180 |
| Yard / Connector | `yard-east`, `connector-west` | (288, 40) | (296, 56) | 0 / 180 |
| Connector / Northeast | `connector-east`, `northeast-south` | (416, 40) | (416, 56) | 0 / 180 |
| Northeast / Southeast | `northeast-east`, `southeast-south` | (536, 160) | (520, 160) | 90 / 270 |
| Southeast / Siding | `southeast-east`, `siding-east-west` | (416, 280) | (416, 264) | 180 / 0 |
| Inside Siding | Siding East local east, Siding West local west | (288, 280) | (288, 264) | 180 / 0 |
| Siding / Southwest | `siding-west-east`, `southwest-south` | (160, 280) | (160, 264) | 180 / 0 |
| Southwest / Northwest | `southwest-east`, `northwest-south` | (40, 160) | (56, 160) | 270 / 90 |

The Corner uses eight R120 pieces in the outer lane and eight R104 pieces in the inner lane.
Each lane combines BrickTracks and TrixBrix curves. Siding East uses the BrickTracks right
inside turnout kit on the inner lane at local (52.5, 27.875), angle 180. The common and through
connectors meet the mainline at local (32, 24) and (72, 24). The branch heads into the interior
through an R104 curve and terminates on an S16.

Yard attaches the BrickTracks S8 at local (132, 24), centered on world (292, 56). Its outer
edge guides remain on the 128-stud table boundary. The S8 starts at x=288 and reaches the
Connector at x=296, with the Connector under the entire footprint.

Each Corner counts a verified PennLUG-style R104 recipe. Yard also requests material counts
for its PennLUG-style S8 so the bring list shows an unavailable recipe next to the counted
materials.

## Native geometry checks

The native oracle reports all 16 seam lanes joined within 0.000001 stud, full table coverage,
and no venue conflicts. The only open end is the siding stub. Shift Connector two studs east
to reproduce exactly two-stud gaps on both lanes of Yard / Connector and Connector /
Northeast. The sole uncovered footprint is the Yard S8 strip from x=288 to x=290 and y=52 to
y=60. The move also introduces a tabletop overlap between Connector and Northeast.

The [template test](../../tests/test_track_templates.mjs) walks both mainlines from the
Northwest south exit using the catalog connectors. The outer loop uses 48 track pieces and
the inner loop 64. The walk checks physical connectivity independently of the declared seams.

For the last-corner preview, start with the closed layout and move Northwest north two studs.
Preview snapping Southwest's local east exit to Northwest's local south exit. The proposed
move aligns that pair and opens the previously joined Siding / Southwest pair by two studs on
each lane. This leaves a concrete second join for the preview to identify.
