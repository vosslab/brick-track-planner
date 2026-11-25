# Usage

## Start a member design

The first screen starts a member design. Enter the width along the track and
the depth from the plexiglass. Common values are expressed in inches and
baseplates, and **Other** accepts a specific size.

For a common 60 by 40 inch display, choose 60 inches for the width, 40 inches
for the depth, and **Straight**, then choose **Create track plan**. The editor
opens with both mainlines and the automatic baseplate grid already in place.

Choose the assigned mainline shape.

- **Straight** puts both NILTC mainlines along the top plexiglass edge.
- **Curve** shows a drawing of each public corner. Choose the top-left or
  top-right bend for the R120 outer line and R104 inner line. The width and
  depth stay on the same drawing axes.
- **General layout** creates a fully covered design area without a NILTC
  mainline.

Use **Open track plan** to continue an LDraw file saved by this planner.
**Other templates** includes the 60 by 40 straight, the corner, the larger
R104 yard with three 128-stud storage tracks, the 130 by 80 inch R104 semicircle
return, and the 120 by 100 inch R120 corner return. Each turnaround links the
two approach tracks at the same edge. [See the turnarounds](SCREENSHOTS.md#r104-semicircle-return).

The area is the member's usable display space. It is not a physical table map.
The planner draws the 32-stud baseplate grid automatically, so members plan
track instead of moving baseplates.

## Compare the straight examples

Choose **Browse straight examples** on the start screen or in the editor.
The gallery opens with nine plans for 60 inches along the track and 40 inches
of depth, followed by five plans for a 40 by 40 inch display. In each size,
the mainline and back-out siding come first. The remaining plans are ordered
by physical track piece count.

Use **PFS** for two perpendicular freight spurs on the right. Each has 32
straight studs with room to extend. Use **4TRY** for three storage tracks
ending flush at the right edge. Trains entering from the west on either
mainline can reach every storage track in both examples without reversing.
For the square display, **PFS40** gives the same access to a single spur.
**DTS60** fits 80 straight studs of storage into the drive-through siding,
with a short lead at each end.

**PT40** connects the outer mainline to a third track while the middle track
runs straight through. **TJ40** serves one perpendicular spur from either
end of the inner mainline. **TJ56** demonstrates two perpendicular spurs on
a private double-track line using a General plan.

Choose a drawing to open it and edit the track. **Close** returns to the
current plan. If you want to keep edits before opening another example,
choose **Save track plan** to download your copy.

<!-- screenshots:begin (managed by screenshot-docs) -->

![Straight examples grouped by 60 by 40 inch and 40 by 40 inch display sizes](screenshots/straight_examples.webp)
<!-- screenshots:end -->

[See each example in the editor](SCREENSHOTS.md#straight-examples).

## Add track that solves a layout job

For a NILTC assignment, **Add track** starts in **Arrangement** mode. It is the
quickest way to add a useful connected build. A **General** layout starts in
**Single piece** mode so you can begin its track.

1. Keep **Back-out parking siding** selected.
2. Choose **Preview on track**. The preview identifies an aligned replacement
   on the mainline and the storage length that fits your area.
3. Choose **Add to layout** when the highlighted placement is the one you want.

![A siding preview on a 60 by 40 inch straight display with the Add to layout button visible](screenshots/member_parking_siding_preview.webp)

Open **Placement options** before previewing and choose 32 or 0 studs of
added straight storage if you want a shorter siding.

Choose **Single piece** to lay an individual rail. In an empty general layout,
the default target is the center of the design area; choose **Place at center**
to start there. Choose **Choose on the drawing** when you want to pick the
location yourself. When exactly one private rail end is open, it is selected
for you; choose **Connect piece** to extend it. Press Escape when you are done.
[Watch the first piece being placed](SCREENSHOTS.md#place-a-single-piece).

The arrangement picker shows the selected kit's footprint and the track it
needs. A successful preview highlights the changes. If a preview fails,
the message below **Preview on track** explains what blocked it. Change the
placement options or the drawing and preview again.

- **Parking siding** creates a back-out or drive-through place behind the
  mainline.
- **Double crossover** changes between two parallel tracks.
- **Right pass-through single crossover R40** changes between the two outer
  tracks across a separate middle route. It fits three 32-stud straight runs
  at 16-stud spacing.
- **T-junction R40** branches from an 80-stud straight run to a perpendicular
  track. **T-junction R40-R56** branches from two 96-stud straight runs at
  16-stud spacing to two perpendicular tracks.
- **Triple switch** opens three routes from one entrance. Choose it on an open
  track or a free area, choose **Preview on track**, then use **Fit location**
  to choose between available placements before **Add to layout**.
- **Four-track drive-through yard** uses opposite-handed R40 yard ladders and
  joins all four storage tracks at both ends. Its selected storage length is
  measured from the shortest track. It needs 192 studs plus the selected
  storage length; use at least a 100 by 60 inch straight area for the default
  64-stud choice.
- **Two-way R104 turnback wye** is a measured R104 wye with mirrored turnouts,
  R104Y adapters, a tail lead, and a two-direction mainline closure.
  Its 32-stud tail fits in a 100 by 60 inch area; use 100 by 70 inches for a
  64-stud tail.

For a larger example, choose **Member yard** under **Other templates**. The
inner mainline remains open past the R104 switches. Each of the three private
tracks has eight S16 straights for parking and ends 16 studs before the edge.
[See the 100 by 60 inch R104 yard](screenshots/member_r104_yard.webp).

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

Click or tap a track piece to select it, then drag it to move it. For an exact
position, open **Move track** in the inspector, enter X and Y in studs, and
choose **Apply position**. X increases to the right and Y increases down.
Use **Delete selected track** in the toolbar to remove the selection. A piece
that carries a named mainline handoff must stay in place. Undo and Redo apply
one design operation at a time. Drag empty space or scroll with two fingers
to pan. Pinch or Control-scroll to zoom. Use the rotate button beside **Fit
view** to turn the view 90 degrees clockwise. The saved plan keeps its original
orientation and coordinates.

The parts panel totals physical pieces in the current design. The findings
panel reports track outside the design area, protected NILTC mainline findings,
and imported parts without usable geometry. Open rail ends remain visible as
connection points while placing or tracing track. A highlighted line or part in
the route panel explains the selected path.

## Save and export

**Save track plan** downloads an editable LDraw `.ldr` file. Share that file
with other LDraw users or use **Open track plan** to continue working on it here.
The planner opens the track files it creates, including its templates.
**Import BlueBrick** creates a
reviewable track plan in the current design-area model and identifies any part
the catalog cannot place.

Choose PNG or WebP for a drawing. Choose PDF for a member build sheet with
design area dimensions, public edge, assigned mainline, named exits, drawing,
route information, and parts list.
