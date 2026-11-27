# Plan: Baseplate colors and patterns

## Goal and context

Add a **Baseplates** button next to **Layout**. Members can set the baseplate colors and pattern for
each track plan and see their choices in the drawing and exported diagrams. Today the detailed
drawing fills the entire design area with one green and derives a 32-stud grid from the outline.

## Design philosophy

Save one appearance setting for the layout and use it to color the existing baseplate grid.

## Scope

- Use a small dialog with labeled swatches, a pattern preview, **Apply**, and **Cancel**. Offer
  Classic White, Classic Green, Bright Green, Classic Blue, Dark Blue, and Light Bley (light bluish
  gray). Use the current green for the Classic Green default.
- Offer Solid, Checkerboard, Vertical stripes, and Horizontal stripes. Solid uses one color. The
  other patterns use two colors and alternate by square, column, or row. Keep rows and columns tied
  to the layout's axes and anchor the repeat at the existing grid origin. Clip it to the outline,
  including cutouts, bump-outs, and partial plates. Keep track and placement warnings readable.
- Apply once as an undoable edit in the active layout. Cancel and Escape discard the draft.
  Save and reopen the setting in `.ldr`. Duplicates inherit it and can be edited independently.
  Standard PNG, WebP, and PDF drawings use the chosen pattern. **Color-coded track** keeps its
  neutral background and returns to the saved pattern when switched off.

## Architecture boundaries and ownership

Keep appearance in `DesignArea` as an optional setting. An unset appearance means solid Classic
Green for starter plans and bundled examples. Use one palette and pattern definition for validation,
the dialog preview, and the shared scene renderer. The Rust evaluator already returns the original
project JSON. Baseplate appearance can pass through to history without entering rail geometry or the
parts tally. The LDraw record stores appearance metadata for the planner.

## File scope

| File or directory | Intended change | Canonical source, for generated output |
| --- | --- | --- |
| `src/appearance.ts`, `src/project.ts`, `src/ldraw.ts` | Palette, pattern contract, and native file round trip. | Palette and project definition in source. |
| `src/scene.ts`, `src/scene_appearance.ts` | Paint and clip the repeating pattern in the shared drawing. | Shared renderer used by the editor and exports. |
| `src/index.html`, `src/main.ts`, editor dialog and styles | Toolbar button, dialog draft, preview, and commit. | Editor source. |
| `tests/`, `docs/` | Focused regressions, usage and format notes, and affected screenshots. | Local Pages build and existing screenshot harness. |

## Milestones

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| 1 | Save appearance | Define the setting and one optional LDraw record. Check that a two-color plan round-trips and a plan with no setting opens with the default. | Every layout owns its choices. |
| 2 | Draw the patterns | Reuse the shared SVG scene for editing and exports. Check all four patterns and verify alignment across an outline edit that crosses the grid origin. | The drawing matches the pattern and stays inside the outline. |
| 3 | Add the dialog | Wire the button and preview. Check keyboard access and touch layout, and verify Apply, Cancel, and Undo. | A member can make or discard one appearance edit. |
| 4 | Verify and document | Run the local Pages release checks with Firefox. Use a touch smoke check, inspect a patterned export, and refresh affected screenshots. | A manager and subagents can finish with automated checks and independent visual review. |

*Plan created with `vosslab-skills:medium-plan-drafter`.*
