# Plan: Layout tabs for Brick Track Planner

## Context

A member wants to open two yards and copy track between them. Another wants to try a longer siding
and flip back to the original to compare. Today a template replaces the drawing, and Copy accepts
one piece. The proposed editor puts named layout tabs immediately above the drawing. A member can
keep working in one planner window and save each design as its own editable LDraw file.

## Objectives

- Open Yard A and Yard B. Copy a selected siding from A, switch to B, and place it with one click
  or tap. The source stays intact and the next click leaves the pasted track in place.
- Duplicate a yard, including unsaved edits. Both versions initially show the same location, scale,
  and rotation. Edit either one, switch back, and see exactly where the designs differ.
- Give mouse, keyboard, and touch users visible ways to switch, copy, paste, save, and close.
- Ask before discarding an unsaved layout on explicit close. Let users open and switch immediately.

## Design philosophy

One canvas is enough to compare two layouts by switching. Keep an editor state and a view per
layout. Share the tools, clipboard, catalog, and rendering code that already work. Add document
state only where an action on one yard could lose work or accidentally act on another.
See [REPO_STYLE.md](../REPO_STYLE.md).

## Scope

- Cover startup, new designs, local files, templates, gallery examples, and reviewed imports.
- Implement tab switching, duplicate-plan naming, renaming, per-layout saves, exports, and closing.
- Extend the existing clipboard to selected track and complete sidings, including touch controls.
- Prove both workflows with the built application and downloaded, reopened plans.

## Non-goals

- Defer split-screen comparison, tab reordering, session restoration, and operating-system
  clipboard integration. Members keep a variant across reloads by saving its layout file.
- Keep Undo/Redo at its current priority. Each tab gets the history its editor state already owns.
- Leave group rotation, multi-delete, box selection, and changes to the LDraw format for separate
  work. Cross-yard paste uses the selection tools already offered by the planner.

## Current state summary

| Current behavior | Implementation consequence |
| --- | --- |
| New, template, file, and accepted import converge on `Planner.#replace`. | Split opening a document from displaying one. Editing the design area still commits to the current layout. |
| `EditorState` has the evaluated project, undo, and redo. The Wasm evaluator returns a newly parsed project. | Retain the state instance when switching. Determine saved content by value because undo can restore the same content as a new object. |
| Camera bounds, quarter-turn angle, captured pointers, and pending track previews live outside the project. | Save the view and end outgoing gestures before redirecting editor callbacks. |
| A single file/template revision suppresses older successful requests. BlueBrick import has one review dialog. | Separate whether an open succeeded from whether its result should take focus. Preserve the review step. |
| Move supports arrays. Paste assigns one fresh ID, strips group metadata, and treats all copied ports as free. | Use rigid translation for a siding. Identify and retain its internal joints before looking for destination snaps. |

Planning baseline at commit `5f40e32`: both repository TypeScript commands below passed without
diagnostics. Existing browser coverage already checks single-piece paste and grouped movement.

## Architecture boundaries and ownership

### Mapping (milestones -> components)

| Milestones | Owner | Contract at the boundary |
| --- | --- | --- |
| M1-M3 | Planner, camera, tab strip | Planner chooses the active document. Camera exchanges view values. The strip reports user actions. |
| M4-M7 | Planner, file actions, area form | Completed opens supply projects. Save captures the initiating document. Only explicit discard removes unsaved work. |
| M8-M9 | Track tools and placement | A session clipboard supplies independent copies. One validated translation commits the entire selection. |
| M10-M12 | Integration, browser verification, documentation | Downloaded plans, visible behavior, focus, and the repository front doors establish completion. |

### File scope

Paths here are relative to the repository root.

- `src/main.ts` owns the ordered list of open tabs and the active tab. Replace the single-state
  assumption here. Retain the existing hooks for panels, inventory, diagnostics, track tools, and
  history. `src/editor_state.ts` already provides the state each tab needs.
- `src/editor_camera.ts` owns camera snapshots and canceling captured gestures. `src/index.html`,
  `src/style.css`, and the existing editor styles own the tab strip, clipboard buttons, and dialog.
  Keep DOM-only keyboard and tab-label wiring together. Project mutations stay in Planner.
- `src/editor_files.ts` owns parsing, import review, template loading, and download initiation.
  `src/area_form.ts` owns moving the existing form between the start screen and its dialog.
- `src/editor_track.ts` owns the shared clipboard and selected-track actions.
  `src/editor_placement.ts` owns exposed rail ends and required joints. Reuse `commitItems` in
  `src/arrangements.ts` and the existing evaluation in `src/engine.ts`.
- Use `tests/playwright/member_design.spec.ts` for the two lasting workflows so the existing touch
  project exercises them. Reuse `tests/playwright/helper_planner.ts` for browser setup and reading
  downloaded plans. Generate the served application from `src/` with the existing build script.
- The npm manifest and lockfile are in scope for the conditional keyboard fallback specified
  below. Ship that fallback with the built application so keyboard navigation works offline.

### TypeScript contracts

Use a private tab record in Planner. Keep its ID stable through rename. Read the display name from
`state.project.name` so the name input, tab, and download share a source. A minimal record has the
following shape. The camera module supplies the view type based on its existing bounds.

```ts
type LayoutTab = {
  id: string;
  state: EditorState;
  view: CameraView | undefined;
  savedProject: Project | undefined;
};
```

An undefined view means fit on first activation. For an opened LDraw file or packaged template,
initialize `savedProject` to the tab's evaluated project. For New, BlueBrick, and Duplicate,
initialize it to undefined. On Save, hold the immutable evaluated project as the new baseline.
At close, compare normalized project contents, for example with JSON serialization when the
references differ. Camera movement, selection, and previews never enter this comparison. Avoid
serializing projects on pointer movement or on each tab switch.

Keep `TrackItem`, `Endpoint`, `Project`, and evaluated rail geometry with their current owners.
The clipboard represents selected track values and the information needed to preserve internal
joints and complete groups after the source closes. IDs in an imported project are local to that
project. Use `projectId` for new item and group IDs on every paste. Keep the existing strict flags
and `import type` conventions. Browser-only tab identities never enter the file parser or export.
See [TYPESCRIPT_STYLE.md](../TYPESCRIPT_STYLE.md).

## Milestone plan

The prerequisite column in the detailed steps defines execution order. The manager can record
completion and evidence against these IDs in this document.

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Open layout state | Separate creating a tab from activating it. | Two editable projects can coexist. |
| M2 | Restore the view | Capture the camera and clear outgoing interactions. | Switching keeps the member's place. |
| M3 | Navigate tabs | Build the named, accessible, scrollable strip. | Every tab is reachable on all supported inputs. |
| M4 | Open sources | Route new, files, templates, and reviewed imports. | Each intentional successful open reaches its own tab. |
| M5 | Branch a design | Duplicate the live project and its view. | Variants start comparable and develop independently. |
| M6 | Save one layout | Capture the initiating layout for each download. | Contents, filename, and saved state agree. |
| M7 | Close a layout | Confirm unsaved work and recover the start screen. | Closing can discard only the intended document. |
| M8 | Copy a selection | Capture track values, joints, and group membership. | Copy outlives switching or closing its source. |
| M9 | Place a siding | Remap IDs, snap exposed ends, and commit the set. | A valid click places one complete independent copy. |
| M10 | Exercise both journeys | Integrate visible actions and browser coverage. | Keyboard and touch users finish both tasks. |
| M11 | Check integration | Run temporary failure scenarios and repository checks. | Material failures are fixed and rechecked. |
| M12 | Publish member guidance locally | Update usage, decisions, and the implementation changelog. | Instructions match the verified editor. |

**Parallel-plan ready: yes.** After the manager assigns the DOM and Planner integration to one
owner, camera work and clipboard geometry can run independently. The file-actions owner can work
against the M1 contract while the strip is built. The browser agent can prepare both journeys from
the user-facing labels. Each exit below uses repository evidence or agent-driven browser actions.

### Establish document and view ownership

**M1. Open layout state.** Entry is the current single-layout editor. Make the active tab the
source for every existing edit, draw, and panel callback. Open adds a tab only after project
evaluation succeeds. Activating an existing tab reuses its cached analysis. Keep an empty list as
the startup state. Exit when opening two different projects preserves both, an edit affects only
the active one, and a rejected project leaves the prior layout usable.

**M2. Restore the view.** After M1, capture pan/zoom bounds and angle before activating another
tab. Snapshot values, not DOM or pointer state. End outgoing drag, pinch, pointer capture, scheduled
hover, arrangement preview, route trace, and selection before the shared scene displays the next
project. Reset tool choices to the existing defaults for that layout. Activating the already
selected tab is a no-op. Exit when two yards retain distinct views and a late pointer release or
animation frame cannot place or move track in the new yard.

**M3. Navigate tabs.** After M1, place the strip between project controls and the drawing. Use
native buttons in a tablist named "Open layouts" and one editor panel labelled by the selected
tab. Expose exactly one selected tab through `aria-selected`. Use its border underline in forced
colors and the existing `:focus-visible` outline to distinguish keyboard focus. Place Duplicate
plan and Close layout outside the tablist. Use text content for all user-supplied names. If open
layouts have the same name, show an ordinal on colliding labels in tab order. Their saved names
remain the names the member entered.

Use `focusgroup="tablist nomemory"`, moving `focusgroupstart` to the selected tab. Feature-detect
native support and load the guide's `@microsoft/focusgroup-polyfill` only when missing. Arrow
keys move focus. Enter or Space activates the focused tab. This protects an unfinished placement
while the member browses tab names. Home and End reach the ends of the strip.
On pointer/touch activation, select immediately. Use a single horizontally scrollable row with a
visible overflow cue. Keep full names accessible, reveal the active or focused tab within the
strip, and keep the canvas stationary. Exit when keyboard entry, activation, re-entry, and touch
overflow work in the built app, including WebKit. Use the strip's normal focus entry on switching
instead of the current unconditional jump to the library heading.
[Chrome tabbed interfaces](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-components/tabs).

### Open, branch, save, and close

**M4. Open sources.** After M1, route startup and editor versions of New, Open track plan, template
picker, and example gallery through the same add-tab operation. Accept BlueBrick only after its
review is confirmed. Editing the assigned area updates its existing tab. Gallery thumbnail loads
only populate previews. Reopening a file or template intentionally makes another independent tab.

Replace the shared latest-request-wins rule with a small focus decision. Each explicit open or
navigation has an order. Append every successful open to the strip when ready. Activate it if it
is still the latest navigation intent, or if it is the only available layout. A late completion
stays in the background when the member has switched, duplicated, or started a newer open. Keep
focus on an open modal, and associate its confirmation with the project that modal describes.
Allow one BlueBrick review at a time using its existing input and dialog. Preserve file-size
checks, validation, cancellation, and useful error messages. Exit when two deliberately delayed
template requests complete in reverse order, both tabs exist, and a subsequent user switch wins.

**M5. Branch a design.** After M2-M3, Duplicate plan captures the active project's current contents
and camera. Create an independent `EditorState` with fresh history. Retain project-local item
and group IDs inside the duplicated document so named handoffs and arrangement references stay
valid. Name the variant `East yard (copy)`, then `East yard (copy 2)` for a second copy of East
yard. Use the existing layout-name input for later renames. Commit an in-progress name edit to its
originating layout before switching or duplicating. Exit when camera and geometry initially match,
then a rename, track edit, or pan in the copy leaves the original untouched.

**M6. Save one layout.** After M1 and M4, capture the project, name, and owning tab when Save
starts. Mark that tab's baseline only after LDraw serialization succeeds and its download is
initiated. An ordinary browser download cannot report whether the user ultimately kept the file.
Export captures the initiating analysis and filename before its first await. Exporting a picture
or PDF leaves the editable layout's saved baseline alone. Exit when the two tabs produce their
own named files and an export finishing after a switch belongs to its
initiator. Verify this using file contents as well as filenames.

**M7. Close a layout.** After M2, M3, and M6, Close layout operates on the active tab. A clean
layout closes immediately. Otherwise name the layout in a native `<dialog>` opened with
`showModal()`. Focus **Keep editing** by default. Use a dialog form with a distinct **Discard
changes** action. Escape, platform dismissal, and Keep editing preserve the tab. Only an explicit
discard for this invocation may remove it. Clear any previous dialog result before reusing it.
Let the modal contain focus and scroll, including its backdrop. Keep ordinary opening and
switching prompt-free. [Chrome dialog guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-components/dialog).

After closing, focus and activate the next tab to the right, or the previous tab at the end.
Closing the final layout hides document actions and returns focus to the original start form.
Reset the form's enabled fields and defaults, including after an earlier Design area edit.
Exit when cancel, discard, and clean close each affect the intended layout and the start screen
can create or open a layout again without reloading.

### Transfer selected track

**M8. Copy a selection.** Entry is the current TrackTools selection and shared lifetime. Support
one piece, a Shift/multiple selection, and Select arrangement. Enable Copy only for a nonempty
selection of track. Copy exactly the visible selected pieces, in project order, and the joints
whose two ends are selected. Use the full project only to determine group membership. If a group
has any hidden or unselected members, its selected pieces paste as a fragment. Hidden members
stay in the source. Discard dependencies on the source document, its area exits, or its undo history. Keep
the clipboard when tabs change or its originating yard closes. Exit when the source can be edited
or closed after Copy and the captured track is available in the destination.

**M9. Place a siding.** After M8, allocate fresh item IDs per paste and remap both ends of each
internal joint. A fully copied multi-piece group gets one fresh group ID per original group and
keeps its catalog arrangement identity. A single piece or fragment pastes as ordinary track,
which keeps inventory from reporting a complete kit for a fragment. Preserve relative positions,
angles, heights, ballast style, and counting flags. Use the destination's existing visible-layer
rule. Anchor the preview at the first captured piece, as the current group Move does.

Pass the internal joints to the existing translation check, excluding their occupied ports from
snap candidates. Ends that formerly joined track outside the copied selection are exposed. Use
destination geometry for all other checks, including area, overlap, height, ambiguous connections,
and named handoffs. Check the complete set before a single commit. A blocked click leaves the
preview available for another location. Escape cancels. A valid click/tap or existing keyboard
placement commits once and returns to selection. Exit when a second paste creates a separately
selectable group and an invalid location leaves the destination's saved contents intact.

**M10. Exercise both journeys.** After M3-M9, wire visible Copy and Paste into the existing track
controls. Paste remains reachable on an empty selection. Reuse the same handlers for shortcuts
and buttons. Protect ordinary text editing, modal key handling, and canvas arrow-key panning.
Check that tab navigation keys act only in the strip and touch users can select an arrangement,
switch tabs, and paste without a hardware keyboard. Exit with the two durable journeys below.
[Chrome accessibility coding guidelines](https://developer.chrome.com/docs/modern-web-guidance/guides/accessibility/accessibility).

## Test and verification strategy

### Permanent browser coverage

Keep two behavior journeys. Extend existing coverage if it proves the same contract. Follow
[PYTEST_STYLE.md](../PYTEST_STYLE.md) and [PLAYWRIGHT_TEST_STYLE.md](../PLAYWRIGHT_TEST_STYLE.md).

1. **Copy a connected siding between yards.** Use a small connected selection with known part
   poses and an identifiable group. Try a blocked destination, then a valid exposed rail end.
   Click elsewhere after placement. Parse the two downloaded plans and check the source, the
   relative geometry and connections of the copy, independent IDs, and destination-only edits.
   This catches partial commits, source mutation, and a return of the moving-copy bug.
2. **Compare and keep an edited variant.** Make an unsaved edit, change the camera, duplicate,
   rename, and edit the variant. Flip between them and check the view and the actual track.
   Cancel closing the unsaved variant. Save it, close it, and check its downloaded contents and the
   surviving original. Use separate named Playwright steps for branching and closing so a failure
   identifies the operation. Exercise reopening in the one-time file check below. Capture
   dirty-close evidence before calling the save helper, because the helper performs a real save.

### One-time implementation checks

**M11. Check integration.** Entry is M10 passing on the built app. Use temporary browser scripts
under `tests/_temp/` for the following cases. Record the outcome against the relevant milestone.

| Scenario | Evidence to collect |
| --- | --- |
| Slow file or template, followed by another open or switch | Control response order. Check both tab names, active focus, and the drawing. Invalid files and canceled imports add zero tabs. |
| Clipboard and group metadata | Close the source after copying. Paste a partial group and repeat a full-group paste. Inspect destination IDs, inventory, layer visibility, and exposed ends. |
| Interaction interrupted by switching | Leave a paste or arrangement preview in A. Switch to B, then click. B receives only actions started there. |
| Keyboard and touch overflow | Open several long or identical names. Inspect the accessibility tree, selected state, focus ring, and overflow on narrow screens and in forced colors. |
| Dirty-state boundaries | Edit and undo to the saved contents, export without saving, and simulate a failed save. Only the correct explicit close asks to discard. Reopen the dialog after a discard and press Escape. |
| Reopen a saved variant | Open the downloaded variant through the real LDraw picker. Compare its parsed name, pieces, and groups with the saved variant. |
| Empty session | Close the last layout after editing its area. Create another design and open a template through the start screen. |

Run the focused member workflow during development, then the complete repository front doors.
The Playwright runner builds and serves the real application. Its configured projects cover
desktop Chromium, desktop WebKit, and touch Chromium.

```sh
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/tsc --noEmit -p tsconfig.lint.json
./run_playwright_tests.sh --build tests/playwright/member_design.spec.ts
npm run check
./run_playwright_tests.sh --build
```

If a saved plan differs, isolate the first incorrect operation by inspecting parsed IDs, poses,
or the chosen tab before changing expectations. If focus fails in one engine, fix the keyboard
or dialog path in that engine and rerun the same journey in both. Retain traces while diagnosing.
Remove the plan's temporary checks at closeout. A new permanent test needs an identified
regression beyond these two workflows and must pass the repository retention checklist.

## Risk register

| Trigger and impact | Owner and recovery |
| --- | --- |
| A stale callback writes or places track in another yard. | Planner owner checks the active-tab switch order and captures the intended owner before asynchronous work. Reproduce with the delayed-open or pointer scenario. |
| A copied siding snaps by an occupied connector or inherits a source group. | Placement owner inspects remapped joints and group IDs in the saved destination. Correct the paste path and rerun the siding journey. |
| A failed download or stale dialog marks work as disposable. | File/close owner checks when the baseline advances and which dialog action removed the tab. Rerun the dirty-close scenario. |
| A keyboard-only or touch member cannot reach another layout. | Strip owner verifies focus entry, overflow, and native/fallback behavior on the built page. Keep the single row and correct the failed interaction. |

## Documentation close-out requirements

**M12. Document the verified editor.** After M11, update [USAGE.md](../USAGE.md), including the
current instruction to save before opening another example. Document both member workflows,
which layout Save affects, how to cancel a placement or close, and what survives a reload. Record
the shipped behavior in [CHANGELOG.md](../CHANGELOG.md) and the implementation rationale in
[DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md). Keep the user priorities in
[HUMAN_GUIDANCE.md](../HUMAN_GUIDANCE.md).

The manager records the final check results, remaining verified limits, and temporary-test cleanup
in this plan, then archives it under the repository's normal plan workflow. Completion is a
verified local build and accurate documentation. Production publication remains a separate action.

## Execution ledger

**Completed 2026-11-26: M1-M12.** The blueprint above records the approved implementation
contract. The integrated local build and member documentation satisfy it.

| Completed work | Owner |
| --- | --- |
| M1, M2, M4, M5, M6, M7 | `tab_planner_impl` |
| M2 camera snapshot/restore | `tab_camera_impl` |
| M3, M7, M10 UI (`setupTabs`, `render`, `confirmClose`) | `tab_ui_impl` |
| M4, M6 IO (`beginOpen`, `open`, saved hooks) | `tab_files_impl` |
| M8, M9 clipboard | `tab_clip_impl` |
| M10 browser journeys | `tab_browser_tests` |
| M11 integration and M12 documentation | Root, with sequential independent reviews |

### Corrections and review

The initial spec review identified three corrections: a late template could open during an edited
Design area, Home/End could scroll the page at an already-focused edge, and copied selections
could overlap internally. The corresponding fixes preserve navigation intent, consume boundary
keys, and validate internal placement geometry. Quality review additionally found a T-shaped route
overlap and an unused camera method; the route check was corrected and the dead method removed.
The final overlap checks cover same-height routed path conflicts and parallel straight beds.
The existing eight-track switch yard remains compatible.

Fresh `tab_spec_rereview` and `tab_quality_rereview` accepted the corrected work.
Fresh `tab_final_integration` explicitly accepted the integrated plan. No review correction or
milestone remains pending.

### Verification evidence

| Check | Final result |
| --- | --- |
| `./run_playwright_tests.sh --build tests/playwright/member_design.spec.ts` | 54 passed |
| `./run_playwright_tests.sh --build` | 68 passed |
| `npm run check` | Passed: 78 Node tests, both TypeScript checks, typed lint, and format |
| `cargo test --locked` | 13 passed |
| `source source_me.sh && python3 -m pytest -q` | 1,482 passed |
| `git diff --check` | Clean |

The initial full built-app run also passed 68 checks; the final run above includes the review
corrections. M11 one-time checks passed 14 file cases, 22 transfer/gesture cases, 25
keyboard/narrow-screen/forced-colors cases, and 16 keyboard-edge cases. File checks included exact
exported PNG bytes, source association, and reopening a saved variant. Geometry compatibility
checked 21 catalog kits, 45 generated configurations, and 20 templates at nine rotations (774
cases), plus 108 independent checks. Both member journeys passed 6/6 across browser projects.
All plan-specific temporary tests and scratch artifacts were removed; `tests/_temp/` is empty.

### Documentation and verified limits

M12 updated the README, [USAGE.md](../USAGE.md), [CHANGELOG.md](../CHANGELOG.md), and
[DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md), retaining the priorities in
[HUMAN_GUIDANCE.md](../HUMAN_GUIDANCE.md). This plan is archived after acceptance.

Layouts remain local to the current session and are kept across reloads through downloaded
editable `.ldr` files. Save verification establishes download initiation and serialized contents;
it cannot establish whether a member ultimately keeps a browser download. No deployment was
performed, and physical train clearance was not tested.
