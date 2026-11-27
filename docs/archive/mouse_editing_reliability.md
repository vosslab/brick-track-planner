# Plan: Make mouse editing predictable across track parts

## Context

At `bdc5099`, the fresh local verifier reported 13 Rust, 72 Node, and 44 Playwright checks. The
baseline also confirmed `cwebp` and `img2webp` 1.6.0, automatic sandbox review for browser and
compatible wasm tools on `PATH`, and these mouse failures:

- Selecting the wrong upper piece in a stack and hit areas around crossover gaps and ballast.
- Rejecting the nearest candidate when another valid target exists.
- Historical wheel pan moving the pending preview 16 studs from the remembered pointer location.
- Escape timing around the drag threshold and a direct three-stud move becoming a no-op.

## Objectives

- Make mouse selection, dragging, placement, and cancellation predictable across track parts.
- Keep existing touch behavior and track validity rules.
- Record implementation evidence and decisions in this ledger.

## Design philosophy

Keep selection and snapping rules explicit, preserve height, angle, structural validation, and rigid
groups, and use seeded evidence to resolve implementation choices. There is no human-dependent gate.

## Scope

- Fix route and visible-width hit areas, stacked selection, drag lifecycle, camera updates, and
  real-join candidate ranking.
- A plain click selects the top selectable piece. `Next track here` cycles candidates.
- A clicked rail-end target hard-filters snap candidates. This is not a general SVG hit-testing
  filter.
- During drag, choose the already selected candidate if it is in the candidate stack; otherwise
  choose the top candidate.
- A direct drag released outside returns to selection. Explicit Move remains armed to retry.
- After validation, if two distinct valid translations at the same preference tier are both
  within the snap radius and their distance scores differ by at most 1 CSS pixel, use the grid and
  show competition feedback. The exact same translation is not a tie.
- Prefer the exposed end nearest the actual press point within 12 CSS pixels.
- Build later with `./check_codebase.sh` and `./devel/verify_release.sh`. Do not publish externally.

## Non-goals

- Changing touch behavior or track validity rules.
- Physical hardware calibration or human usability studies.
- External deployment or publication.

## Milestones

M2, M4, and M6 can proceed independently after M1. M3 follows M2 and M5. M7 follows M3 and M6.
M8 follows M7. M9 and M10 follow M8 independently. M11 follows M9 and M10.

```text
M0 -> M1 -> {M2, M4, M6}
M4 -> M5
M2 + M5 -> M3
M3 + M6 -> M7
M7 -> M8 -> {M9, M10}
M9 + M10 -> M11
```

| ID | Depends on | Work and acceptance evidence |
| --- | --- | --- |
| M0 | None | Baseline captured: `bdc5099`; 13 Rust, 72 Node, 44 Playwright; `cwebp`/`img2webp` 1.6.0; automatic sandbox review for browser and compatible wasm tools on `PATH`. |
| M1 | M0 | Add minimal reproducible fixtures for the listed mouse failures and confirm each reproduces. |
| M2 | M1 | Correct route and visible-width hit areas, including crossover gaps and ballast; preserve selectable track regions. |
| M3 | M2, M5 | Add a stacked-track picker and selected-candidate preference in shared `main.ts`; apply the clicked rail-end snap-candidate filter. |
| M4 | M1 | Make cancellation consistent from pointer down through release. Escape cancels before and after drag threshold; outside direct release returns to selection, while explicit Move stays armed to retry. |
| M5 | M4 | After historical wheel pan, refresh pending preview at remembered screen point; reproduce the reported 16-stud displacement. |
| M6 | M1 | Rank valid real-join fallback candidates; resolve distinct near-equal translations at the same preference tier with grid and competition feedback. |
| M7 | M3, M6 | Prefer the exposed part end near actual press within 12 CSS pixels; show joint and grid. |
| M8 | M7 | Show a one-stud grid before drag, shared with Move; reset on finish, cancel, or tab change. |
| M9 | M8 | Independently review specification and quality; run browser evaluator and record findings and disposition. |
| M10 | M8 | Update documentation and screenshots for implemented mouse behavior. |
| M11 | M9, M10 | Run final gates, record exact reproduction and verification evidence, and archive this plan. |

## Execution ledger

| ID | Status | Owner | Evidence / notes |
| --- | --- | --- | --- |
| M0 | Complete | manager | Verified at `bdc5099`: 13 Rust, 72 Node, 44 Playwright; `cwebp`/`img2webp` 1.6.0; automatic sandbox review for browser and compatible wasm tools on `PATH`. |
| M1 | Complete | `browser_cases` | Prior red runs reproduced 6 expected failures across 3 durable tests in Chromium/WebKit, plus 10 expected failures across 5 temporary scenarios. |
| M2 | Complete | `hit_regions` | Modeled visible areas and painted sleeper/ballast hit areas. Empty space between crossover routes pans; the painted sleeper remains selectable. Scoped smoke passed. |
| M3 | Complete | manager | Added stack controls and selected-lower-track preference. Durable regression set passed 9/9 across Firefox, Chromium, and WebKit; this set includes M4/M5 coverage. |
| M4 | Complete | `camera_gesture` | Core cancellation behavior covered by the cross-browser 9/9 durable regression set, including wheel-preview and outside-release matrix cases. |
| M5 | Complete | manager | Core wheel-preview refresh behavior covered by the cross-browser 9/9 durable regression set, including the outside-release matrix. |
| M6 | Complete | `snap_candidates` | Real-Wasm Node suite passed four cases, including decimal pose correction, same-pose false-tie prevention, and retained analysis memory. |
| M7 | Complete | manager | Source implementation completed. Independent Firefox walkthrough confirmed source b-to-a selection, tie handling, and fine movement with undo. |
| M8 | Complete | manager | Source implementation completed; included in the independent Firefox walkthrough and M3 regression coverage. Preview wording uses present tense, polite live announcements keep the global status unique, and keyboard focus returns to its prior control. |
| M9 | Complete | manager | Scoped independent integrated quality review and browser evaluator completed with no blocker. Firefox, Chromium, and WebKit each passed 7/7 HCI scenarios. Scoped axe found zero issues. Contrast measured 8.27:1 for the hint, 16.02:1 for feedback and controls, and 6.90:1 for focus. Integrated review directly dragged initially unselected track at 1280, 760, and 420 px widths. |
| M10 | Complete | manager | Documentation and screenshots completed: `mouse_overlap_selection.webp` and `select_multiple_track.webp` (1600x1000), plus `place_single_track_demo.webp` (1200x750, four frames). Chromium capture harness passed. Firefox 159 is installed and wired into the full verifier. |
| M11 | Complete | manager | `./check_codebase.sh` passed. `./devel/verify_release.sh --reporter=dot` passed 13 Rust, 76 Node, and 69 Playwright checks; the 19 Firefox checks were discovered and included in the aggregate. A final temporary matrix passed 57/57 scenarios (19 each in Firefox, Chromium, and WebKit) and was removed. Targeted Markdown/source checks passed 466 tests; one nonblocking advisory noted a 900-line source file. `git diff --check HEAD` passed. A 132-piece representative member yard measured about 1.14 ms p95 for a single storage-straight snap in Node Wasm. A synthetic 600/400 failed-pose case took about 1.13 s; this is not a real-device performance estimate. Final headless direct-drag spot check moved the S4 filler to (80,54), snapped an R104 curve to straight at (55.500,48.938), and accepted a 22.5-degree straight on the LEGO R40 turnout branch at (129.146,68.642); all nine passes across Firefox, Chromium, and WebKit with saved pose/joint and undo enabled. |

## Decisions

- Source owners stay within their assigned boundaries; the manager resolves conflicts using seeded
  evidence.
- M11 uses `./check_codebase.sh` and `./devel/verify_release.sh`; no external publishing.
- Near-tie handling compares distance scores: both candidates must be within the snap radius, at
  the same preference tier, and differ in score by no more than 1 CSS pixel.
- Final temporary scenarios are removed after verification; the committed browser coverage remains
  the durable regression set.

## Risks and limits

- Hit-testing changes can affect overlap selection; cover stacked-track cases.
- Camera transforms can stale a preview unless refresh uses the remembered screen point.
- This plan does not establish physical calibration or human usability.
- Synthetic many-failed-candidate cases can be slow; the measured synthetic result does not predict
  real-device performance.

## Completion

All milestones M0-M11 are complete, and final verification evidence is recorded. This plan is ready to archive.
