# Plan: Improve track editing for mouse and touch

## Context

The planner serves club members who start from an assigned area, component, or
kit. The previous editor required selecting a piece before dragging and put
exact placement in an inspector disclosure.

## Objectives

- Let members directly drag track with a mouse and use Move, destination, and
  Place on touch.
- Move multiple selected pieces and installed kits as a unit.
- Snap to compatible rail ends, with an 8-stud shift as the ordinary grid
  placement and a 1-stud grid for finer positioning.
- Fill straight gaps between components with catalog pieces.

## Design philosophy

Use one editor, project format, and Undo history. Show placement, joints, and
blocking reasons beside the drawing. Choose gestures from the actual pointer.
A move preserves the piece angle. Individual rotation uses quarter turns.

## Scope

- Support selection by click, tap, keyboard, Shift-click, and Select multiple.
  Use existing arrangement group IDs for Select arrangement.
- Preview a move, duplicate, or gap fill before placement. Keep the named
  mainline handoffs protected and mark joints that a move opens.
- Validate straight gaps for facing ends, alignment, rail height, catalog
  fit, clearance, and confirmed joins at both ends.

## Non-goals

Use existing components and kits for turns, crossovers, and branches. Keep
the assigned display area and LDraw project as the editing boundary.

## Architecture boundaries and ownership

- [src/editor_camera.ts](../../src/editor_camera.ts) owns 2D view gestures
  and pointer conversion. [src/editor_track.ts](../../src/editor_track.ts)
  owns selection, active editing tool, and preview state.
- [src/editor_placement.ts](../../src/editor_placement.ts) uses the
  existing catalog and geometry checks. The scene renders transient previews.
  Undo stores committed projects.

## Milestone plan

| M | Title | Deliverable | Exit criterion |
| --- | --- | --- | --- |
| 1 | Shared editing | Direct drag, tap placement, selection, rotation, and duplicate | Browser workflows move and undo a piece or selection |
| 2 | Physical placement | Rail snap, grid shifts, and straight-gap fill | Valid placement produces real joints and rejected edits preserve the plan |
| 3 | Verification | Browser tests, responsive checks, usage, and release build | Release checks pass and device coverage is recorded |

Milestone 2 uses the shared preview and commit path in milestone 1. Straight
gap geometry and browser interaction checks can proceed independently once
that path exists.

## Test and verification strategy

- Exercise first-grab mouse drag, touch staging, cancellation, group movement,
  quarter turns, protection, and Undo. Compare saved track plans and joints.
- Verify obstruction, unsupported gap length, and mismatched rail height.
- Measure edit control sizes and containment in narrow viewports and verify
  keyboard access to highlighted endpoints.
- Verify the Pages build with `./devel/verify_release.sh`. Record whether the
  touch evidence comes from emulation or a physical phone.

## Verification results

- The Pages build passed with 13 Rust, 78 Node, and 81 Playwright checks.
  The editing checks ran in Chromium, WebKit, and an emulated Pixel 7.
- A walkthrough moved and undid a two-piece section of the bundled back-out
  siding and filled an open gap in the bundled eight-track yard. It used
  mouse, keyboard, and emulated touch input.
- The narrow-screen toolbar controls measure at least 44 CSS pixels tall.
  The edit hint, blocked hint, and Place button text each exceed 7:1 contrast.
  Physical-phone sessions and club-member usability testing remain unverified.
