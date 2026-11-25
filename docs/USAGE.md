# Usage

## Start a member design

The planner designs one member's assigned display area. Enter the width along
the track and the depth from the plexiglass. Common values are expressed in
inches and baseplates, and **Other** accepts a specific size.

Choose the assigned mainline shape.

- **Straight** puts both NILTC mainlines along the selected public edge.
- **Curve** puts both mainlines around the selected public corner using an
  R120 outer line and an R104 inner line.
- **General layout** creates a fully covered design area without a NILTC
  mainline.

The area is the member's usable display space. It is not a physical table map.
The planner draws the 32-stud baseplate grid automatically, so members plan
track instead of moving baseplates.

## Add track that solves a layout job

Use the arrangement tools for a complete set of pieces. The preview highlights
the changed track and reports an overhang or collision before applying it.

- **Parking siding** creates a back-out or drive-through place behind the
  mainline.
- **Double crossover** changes between two parallel tracks.
- **Triple switch** opens three routes from one entrance. Choose it on an open
  track or a free area, select **Preview**, then use **Fit location** or
  **Next fit** to choose an offered aligned placement before **Apply**.
- **Four-track drive-through yard** uses opposite-handed R40 yard ladders and
  joins all four storage tracks at both ends. Its selected storage length is
  measured from the shortest track. It needs 192 studs plus the selected
  storage length; use at least a 100 by 60 inch straight area for the default
  64-stud choice.
- **Two-way R104 turnback wye** is a measured R104 wye with mirrored turnouts,
  R104Y adapters, a tail lead, and a two-direction mainline closure.
  Its 32-stud tail fits in a 100 by 60 inch area; use 100 by 70 inches for a
  64-stud tail.

TrixBrix product sets can include required specialty connectors and separately
sold entrance switches. The inventory lists each placed physical part, rather
than treating a product photo as one imaginary piece.

Choose a start connector in **Trace from**, then choose **Trace route** and
click a storage track or another connector. The route follows real port pairs
inside switches and across joined track ends. It does not treat a crossing as a
turn where no rail joins.

## Build to the club mainline

NILTC starters use the club's 8- and 24-stud lane positions and +2-plate rail
height. Mainline checks cover the assigned exits, R104/R120 curve requirement,
and required straight track between curves, switches, and bridges. Yard checks
remain advisory because the member is free to choose a compact private design.

The mainline assignment comes from Roger. The planner designs a buildable
version of that assignment inside the member's display area.

## Edit and inspect

Click or tap a track piece to select it. Use the arrangement tools or
**Place connected track** to add rail, and use **Remove selected track** to
remove a selected piece. Undo and Redo apply one design operation at a time.
Pinch or Control-scroll zooms. Two-finger scroll and drag pan.

The parts panel totals physical pieces in the current design. The findings
panel reports track outside the design area, protected NILTC mainline findings,
and imported parts without usable geometry. Open rail ends remain visible as
connection points while placing or tracing track. A highlighted line or part in
the route panel explains the selected path.

## Save and export

**Save** downloads the editable `.btp.json` project. **Open** validates a
saved file before replacing the current design. **Import BlueBrick** creates a
reviewable track plan in the current design-area model and identifies any part
the catalog cannot place.

Choose PNG, WebP, PDF, or LDraw from Export. The PDF is the member handoff:
design area dimensions, public edge, assigned mainline, named exits, drawing,
route information, and parts list. LDraw includes mapped track only.
