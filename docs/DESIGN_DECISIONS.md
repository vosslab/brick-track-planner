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
