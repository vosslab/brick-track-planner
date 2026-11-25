# Design decisions

<!-- VENDORED HEADER: START -->
Record each durable decision about how this code and repository are shaped, once it is settled, with
the reasoning a later reader needs. Guidance Neil Voss states belongs in
[HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md), dated history in `docs/CHANGELOG.md`, open discussion in
`docs/active_plans/decisions/`. [PROPAGATED HEADER - ENTRIES BELOW ARE YOURS]
<!-- VENDORED HEADER: END -->

Write each decision as a level-three heading with these four fields. `Owner` names the
authoritative code or contract document, rather than a person.

```markdown
### <decision title>

**Decision.** <the durable direction>

**Why.** <the reason it was chosen>

**Consequence.** <the constraint a future change preserves>

**Owner.** <the authoritative code or contract doc>
```

### Project state belongs to TypeScript

**Decision.** Keep the authoritative project and editing history in TypeScript; keep Rust/Wasm
geometry evaluation stateless and batch-oriented.

**Why.** One owner for project state avoids competing snapshots between the editor and geometry
engine.

**Consequence.** The engine receives explicit inputs and returns results without owning project
history.

**Owner.** [BRICK_TRACK_PLANNER_V1.md](active_plans/active/BRICK_TRACK_PLANNER_V1.md)

### Use NILTC table presets

**Decision.** V1 uses nominal 30x40, 40x40, and 40x60 inch NILTC sections, represented as 96x128,
128x128, and 128x192 studs, with sections rotatable in the layout.

**Why.** The presets give layouts a consistent tabletop fit target.

**Consequence.** Fit checks use the union of configured section footprints, including connected
sections.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md)

### Keep seam ports stable

**Decision.** Each section seam has two persistent port pairs, with exact X/Y port snapping; front
lane guides sit 8 and 24 studs from the front edge.

**Why.** Stable connection points make joined sections repeatable while keeping the front track
lanes aligned.

**Consequence.** A section arrangement retains its seam pairs and lane guide positions as it is
edited.

**Owner.** [GEOMETRY_MODEL.md](GEOMETRY_MODEL.md)

### Use a portable project file

**Decision.** Use `.btp.json` as the native save/open format and import BlueBrick v9 XML within the
documented v1 support boundary.

**Why.** A portable local file supports save and reopen without accounts or server storage.

**Consequence.** Project data stays local to the user's browser workflow; imported BlueBrick
behavior is limited to the supported contract.

**Owner.** [FILE_FORMAT.md](FILE_FORMAT.md)

### Exchange sections as snapshots

**Decision.** Use version 2 of the native project to store the whole show. Exchange a reusable
section as a portable snapshot imported into that flat project. TypeScript migrates version 1 on
file open.

**Why.** Members can share editable layouts as files and the coordinator can place independent
copies using the same editor and geometry engine.

**Consequence.** Bundle copies carry table, item, layer, exit, and internal seam references.
Imports remap the IDs. External joins and member bring commitments belong to the show.

**Owner.** [BRICK_TRACK_PLANNER_VFINAL.md](active_plans/active/BRICK_TRACK_PLANNER_VFINAL.md)

### Separate appearance from fit

**Decision.** Generate original SVG from catalog geometry. Store baseplate color and ballast style
as appearance, and use a separate option to count verified recipe materials.

**Why.** Accurate connector poses and explicit plate heights support fit checks while appearance
makes the show and close-up layouts easier to understand.

**Consequence.** Style and recipe edits leave rail height, position, snapping, and coverage
unchanged. Published recipes apply only to their verified track IDs. Missing recipes are reported.

**Owner.** [BRICK_TRACK_PLANNER_VFINAL.md](active_plans/active/BRICK_TRACK_PLANNER_VFINAL.md)

### Separate starter creation from opening

**Decision.** The welcome flow asks what the user is designing and offers 40x40, 60x40 Straight,
60x40 Curve, and Advanced. Open existing remains a separate action.

**Why.** A new layout starts with a fitting editable surface while existing work remains easy to
open without implying that it should be replaced.

**Consequence.** Starter choices create editable projects; Open existing uses the current file
workflow.

**Owner.** [BRICK_TRACK_PLANNER_VFINAL.md](active_plans/active/BRICK_TRACK_PLANNER_VFINAL.md)

### Keep starter geometry table-local

**Decision.** Starter baseplates use an editable 32-stud grid. NILTC starters prelay table-local
lanes at offsets 8 and 24. Curve starters use a 128x128 center plus a 64-stud tangent, giving a
192x128 footprint.

**Why.** Editable plate geometry and local lane references keep table contents stable as members
arrange tables.

**Consequence.** The two lane offsets and the curve tangent belong to the starter table geometry;
whole venue placement does not rewrite them.

**Owner.** [BRICK_TRACK_PLANNER_VFINAL.md](active_plans/active/BRICK_TRACK_PLANNER_VFINAL.md)

### Keep table and section rotation distinct

**Decision.** Member nominal tables turn in quarter turns and move on a 32-stud grid. The
coordinator rotates a whole section rigidly by any angle.

**Why.** Member layouts align to the shared table standard, while venue placement needs flexible
orientation without changing internal spacing.

**Consequence.** Baseplates and attached items remain table-local; section rotation applies one
rigid transform to all member tables and their contents.

**Owner.** [BRICK_TRACK_PLANNER_VFINAL.md](active_plans/active/BRICK_TRACK_PLANNER_VFINAL.md)

### Separate standards from joins

**Decision.** Preserve v1 and BlueBrick import geometry and free editing without automatic table
tags or movement. Explicitly tag new v2 starters and presets. Users can apply NILTC checks to any
imported table; report off-grid placement without moving it and enable guided future edits.
Report each lane and exit standards result separately from ordinary connector joins.

**Why.** Imported layouts should retain their authored geometry and remain editable, while
standards feedback should identify off-grid placements without confusing them with broken joins.

**Consequence.** Imported tables are not reclassified or moved automatically. Standards checks do
not alter ordinary join evaluation.

**Owner.** [BRICK_TRACK_PLANNER_VFINAL.md](active_plans/active/BRICK_TRACK_PLANNER_VFINAL.md)

### Share one inventory report

**Decision.** Derive a member's required materials across the visible parts of every section
they own. Use the same report in the editor and setup packet.

**Why.** The coordinator can compare one commitment per physical part with the full amount
required across the show.

**Consequence.** Blank commitments remain unconfirmed, a confirmed zero can produce a shortfall,
and unknown owners are unassigned. Kits contribute their physical pieces once.

**Owner.** [BRICK_TRACK_PLANNER_VFINAL.md](active_plans/active/BRICK_TRACK_PLANNER_VFINAL.md)
