# Design decisions

<!-- VENDORED HEADER: START -->
Record each durable decision about how this code and repository are shaped, once it is settled, with
the reasoning a later reader needs. Guidance Neil Voss states belongs in
[HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md), dated history in `docs/CHANGELOG.md`, open discussion in
`docs/active_plans/decisions/`. [PROPAGATED HEADER - ENTRIES BELOW ARE YOURS]
<!-- VENDORED HEADER: END -->

### Keep one design area per project

**Decision.** A native project has one `area` with dimensions, public edge or
corner, NILTC assignment, and named boundary exits.

**Why.** A member owns a display space and track inside it. Physical table maps
and show-wide placement are owned outside this application.

**Consequence.** Items use area coordinates directly. Tables, sections, seams,
venue placement, members, and movable baseplates are absent from version 3.

**Owner.** [FILE_FORMAT.md](FILE_FORMAT.md)

### Derive baseplate coverage

**Decision.** Render a 32-stud baseplate grid from the design area.

**Why.** Every supported train display area is fully covered, and rail geometry
does not depend on individual baseplate objects.

**Consequence.** Coverage is always current after an area resize and cannot be
accidentally moved away from track.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md)

### Treat routes as catalog data

**Decision.** Every physical catalog part defines its valid port-to-port
routes, independent of its visible rail paths and footprint.

**Why.** A track drawing alone cannot tell whether a train can take a turnout,
cross a double crossover, or reach a storage track.

**Consequence.** The route graph can trace real travel paths, validate mainline
handoffs, and keep isolated crossing lines isolated.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md)

### Expand arrangements into physical parts

**Decision.** A crossover, triple switch, or yard template becomes the actual
parts in its measured assembly when placed.

**Why.** The parts list, connector graph, fit feedback, and export need the
same physical representation.

**Consequence.** Product templates can identify separately required entrance
switches and specialty connectors without double-counting them.

**Owner.** [data/catalog.json](../data/catalog.json)

### Keep standards checks on the protected mainline

**Decision.** Apply NILTC lane, height, radius, and event-spacing checks to
the named mainline paths. Treat private-yard feedback as advisory.

**Why.** Club handoffs need consistent geometry while members need room for
compact and creative storage track.

**Consequence.** R40 and R56 catalog pieces remain available for yards and
general layouts without changing the required R104/R120 mainline geometry.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md)
