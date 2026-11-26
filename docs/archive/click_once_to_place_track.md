# Plan: Click once to place track

## Context

Pasted and duplicated track remains a movable preview after its first destination click. Members
expect a LibreOffice Draw or Inkscape style direct edit, where that click keeps the track.

## Objectives

- Commit a valid pasted, duplicated, or explicitly moved track selection on its destination click.
- Preserve validation, snapping, undo, selection, and explicit review for gap fills and arrangements.
- Verify the saved track plan retains the copy after a later click elsewhere.

## Design philosophy

Use the repository's Keep it simple (KISS) principle. Reuse the shared translation preview and
commit path, changing only when a ready preview is accepted.

## Scope

- Update everyday track placement in `TrackTools` and its editor controls.
- Update browser coverage for mouse, keyboard, and touch placement.
- Update member guidance, settled design rationale, and the changelog.

## Non-goals

- Redesign arrangements, gap fills, file formats, or clipboard lifetime.
- Add placement preferences, saved state, dependencies, or new public APIs.

## Architecture boundaries and ownership

`TrackTools` owns preview readiness and one-time commits. `EditorCamera` only supplies pointer
coordinates and gesture classification. Existing `EditorState` history owns Undo and Redo.

## Milestone plan

| M | Deliverable | Agent-verifiable exit |
| --- | --- | --- |
| M1 | Regression test | Existing behavior fails after destination click and later canvas click. |
| M2 | Direct commit | Saved plan contains the selected result and one undo removes it. |
| M3 | Mouse preview | Hover changes only the preview and release or click commits valid placement. |
| M4 | Controls and keyboard | Everyday placement completes in one action with useful focus and cancel behavior. |
| M5 | Documentation | Usage, decision record, guidance, and changelog agree. |
| M6 | Integrated evidence | Type, browser, and independent-review checks pass. |

## Test and verification strategy

Use the saved `.ldr` project as the behavior oracle. Run the focused Playwright regression while
developing, then `./check_codebase.sh` and `./run_playwright_tests.sh --build`. Review the final
interaction against the critical mouse, keyboard, and touch paths.

## Progress ledger

| Milestone | Status | Evidence |
| --- | --- | --- |
| M1 | Complete | The paste regression failed in all three browser projects. The saved plan contained one piece where the test expected two. |
| M2 | Complete | A valid destination commits one edit. The copy survives a later canvas click, and one Undo removes it. |
| M3 | Complete | Hover updates the preview. A valid click or drag release commits the placement and returns focus to the drawing. |
| M4 | Complete | Touch tap and keyboard activation commit valid translations. Cancel and explicit gap confirmation remain available. |
| M5 | Complete | Usage, human guidance, design decisions, and changelog agree. All 53 documentation checks passed. |
| M6 | Complete | `./check_codebase.sh` passed, including 78 Node tests. `./run_playwright_tests.sh --build` passed 62 tests. Three independent Chromium walkthroughs passed, and their temporary tests were removed. Code and spec review accepted the change. |
