# Plan: NILBC interface refresh

## Goal and context

Apply the approved D&beta; palette to the planner's light interface. The managed runner has
passed 35 baseline browser checks and captured 33 baseline WebP documentation images.
[NILBC D&beta; reference](https://vosslab.github.io/nilbc-web/d-beta/)

## Design philosophy

Use the palette to reinforce the existing control hierarchy and keep the drawing easy to read.

## Scope and contracts

- Use `#2768A5` with white for the banner and primary actions, `#FBF6EC` cream around white
  surfaces, `#13213C` navy for text, and `#F2CD37` yellow for the existing mark, Export,
  and the accent rail.
- Use pale blue for editor headings and hover states, pale yellow for selected controls, and
  red-brown for warnings. Preserve existing shapes and other visual cues for state.
- Keep the current fonts, responsive layout, controls, track drawing, and overlays. Retain
  the existing edit, save, and export behavior. The `editor_track` split is a separate change.

## File scope

| File or directory | Intended change | Canonical source for generated output |
| --- | --- | --- |
| [src/style.css](../../src/style.css) | Shared colors, shell, setup, gallery, and dialogs | |
| [src/planner_build.css](../../src/planner_build.css) | Editor surfaces and control states | |
| [src/index.html](../../src/index.html) | Update markup only as needed to apply the palette | |
| [docs/screenshots/](../screenshots/) | Refresh affected documentation images | Current Pages build and [docs/SCREENSHOTS.md](../SCREENSHOTS.md) |
| [docs/CHANGELOG.md](../CHANGELOG.md) | Record the interface refresh | |

## Milestones

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| 1 | Capture the baseline | Verification agent captures 1280 &times; 800 and 390 &times; 844 views and exports the seeded Back-out siding PNG. | Save reproducible comparisons. If a capture fails, fix the server or capture inputs and rerun against the baseline build. |
| 2 | Apply the shell palette | UI implementer updates the shared colors, banner, mark, file controls, and accent rail. | Compare both viewport captures. Resolve contrast or layout drift in shared styles. |
| 3 | Apply the setup palette | UI implementer styles the startup cards, forms, and primary actions. | Verify the setup choices and form feedback at both widths. Correct component styles where controls clip or states become unclear. |
| 4 | Apply the editor palette | UI implementer styles panel headings, hover and selection states, and warnings. | Inspect the editor at both widths. Correct any obscured drawing, overlay, or control state. |
| 5 | Apply gallery and dialog colors | UI implementer styles example cards, dialog surfaces, and actions. | Open the gallery and dialogs at both widths. Correct unreadable states or displaced controls. |
| 6 | Review accessibility | Independent reviewers confirm at least 5.5:1 for text and 3:1 for essential controls, then check keyboard navigation, visible focus, and forced colors. | Implementers correct failures and reviewers repeat the affected checks. |
| 7 | Verify and recapture | Verification agent runs `./devel/verify_release.sh`, compares decoded before-and-after PNG pixels using identical seeded inputs, and refreshes affected WebPs at quality 90. Changelog owner records the change. | Diagnose failing checks or pixel differences and rerun after correction. Inspect fresh captures before replacing documentation images. |
| 8 | Hand off the local refresh | Manager coordinates serialized writes to shared files and artifacts throughout, checks the final diff, and reports verification and any remaining issues. | Deliver the reviewed refresh in the local checkout. |

*Plan created with `vosslab-skills:medium-plan-drafter`.*
