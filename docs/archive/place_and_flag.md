# Place and flag

Completed and accepted on 2026-11-26. Current behavior is documented in
[USAGE.md](../USAGE.md) and [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md).
This supersedes the valid-only placement contract in
[click_once_to_place_track.md](click_once_to_place_track.md).

## Outcome and scope

Users can put down ordinary track on the destination gesture, then repair
flagged geometry. Overlap, outside-area track, and facing rail ends at different
heights become project-derived findings. Regular open ends remain useful.
Use the existing project, analysis, drawing, history, and tabs; add no mode or
saved warning state. Guided searches continue to propose arrangements that fit.
Protect named mainline handoffs and structural/file limits. Public deployment
is outside this work.

## Small delivery milestones

- [x] **M1: Finish the drop.** Move, drag, paste, duplicate, and ordinary free
  placement, including whole catalog arrangements without a connected fit,
  commit on their existing destination gesture even with geometric problems.
  The next click selects normally; Undo removes one completed edit.
- [x] **M2: Derive geometric findings.** Report same-height rail conflicts,
  outside-area track, and coincident facing ends at different heights from the
  current project. Keep intended joins and catalog crossings valid; leave
  ordinary open ends alone. Fixing or removing the cause removes the finding.
- [x] **M3: Show the repair target.** Identify affected track in the drawing
  and explain each problem in the existing findings panel. Preserve guided
  fit search and existing handoff protection.
- [x] **M4: Reopen and switch layouts.** Save/reopen, Undo/Redo, and tab changes
  produce the same current findings without persisting warnings or leaking
  them between layouts. Update directly affected usage and decision text.
- [x] **M5: Review and close.** Automated checks and independent reviews pass.
  Browser assertions follow the completed-drop contract. Results are recorded
  below and the completed plan is archived.

## Verification ownership

Permanent behavior checks cover a completed problematic drop, repair/removal,
and recomputed findings through reopen and layout changes. Existing checks
were extended where practical; overlap and outside-area assertions follow the
completed-drop contract.

One-time implementation checks inspect drawing highlights, representative
intended catalog joins/crossings, regular open ends, and the final diff.
Only checks protecting supported behavior remain permanent; screenshots and
broad matrices are implementation evidence. Automated checks and independent
review establish completion without a human interaction milestone.

## Results

The interaction follows the user's requirement: "users get frustrated when
hold a piece and then they cannot put it down". Held mouse and one-finger
press-drag-release complete the drop; click/tap placement remains available.
Normal camera controls remain available. Connected siding recommendations
respect rail height, while free drops report modeled geometry problems.

M1-M5 implementation, behavior checks, and independent reviews are complete.
The final verified run passed 68/68 built-site Playwright checks
across Chromium, WebKit, and Pixel touch, 78 Node tests with strict
TypeScript, typed lint and format checks,
13 Cargo tests, and 1,492 pytest tests.
After archiving, the full pytest suite passed again: 1,492 tests.

Permanent checks retain supported drop, repair, history, reopen, and layout
isolation paths. Redundant paths and broad example matrices were trimmed.
One-time evidence covers six member journeys: mouse overlap, repair,
save/reopen and tab isolation once each in Chromium and WebKit; emulated-touch
overlap; Enter placement with height warnings; a no-fit corner kit in a
96-stud area retaining 24 original pieces and adding eight grouped pieces;
and a single-piece free drop. It also covers overlap scans, all 20 templates,
all 21 catalog assemblies, and calibration and gesture checks. A sparse
10,000-item mixed-height scan calculated warnings in approximately 38 ms on
this machine. These checks are implementation evidence, not new permanent
test-suite requirements or a general performance guarantee.

Fresh specification review (`flag_spec_clearance`) and quality review
(`flag_quality`) accepted the final correction for nonparallel straight-bed
overlap and matching catalog adapter ends at different heights. Final
integration review (`flag_integration`) accepted the result after 15 independent
Chromium, WebKit, and touch checks. Plan-specific scripts under `tests/_temp/`
were removed after retaining the permanent behavior checks described above.

Findings describe modeled rail geometry, not physical train or scenery
clearance. Touch verification uses browser emulation; physical-device gestures
and physical builds were not checked. This work is local; no commit, push, or
deployment was performed.
