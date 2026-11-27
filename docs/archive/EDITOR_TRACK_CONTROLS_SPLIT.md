# Plan: Split track editor controls

## Goal and context

Bring `src/editor_track.ts` below the repository's 900-line advisory threshold by moving the
toolbar and selection inspector rendering into one focused module.

## Design philosophy

Keep editor state and mutations in `TrackTools` and render the controls from the state it supplies.

## Scope and contracts

- Keep the `TrackTools` interface and its existing callers intact.
- Preserve control state, hints, selection and ballast behavior, and interaction timing.
- Keep toolbar updates during pointer interactions independent of selection inspector updates.

## File scope

| File | Intended change |
| --- | --- |
| `src/editor_track.ts` | Forward current editor state and keep ballast commits with the controller. |
| `src/editor_track_controls.ts` | Render the edit toolbar and selection inspector. |
| `docs/CHANGELOG.md` | Record the module split. |

## Milestones

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| 1 | Extract controls | Move rendering into two functions at the existing refresh points. | Keep interaction behavior while reducing controller size. |
| 2 | Verify the split | Check line counts and run local code and browser checks. | Confirm the split meets the size convention and the existing tests pass. |

*Plan created with `vosslab-skills:medium-plan-drafter`.*
