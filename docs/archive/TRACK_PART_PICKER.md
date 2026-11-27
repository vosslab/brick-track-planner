# Plan: Help newcomers find track parts

## Goal and context

Help a first-time planner find a standard straight, a switch that branches in the right direction,
or a way to change between parallel tracks. The current picker lists 62 entries by manufacturer
and catalog name, including individual sections of multipart switches. A member has to recognize
the name before seeing the shape.

## Design philosophy

Let members recognize track by shape and purpose first. Show size beside the drawing and keep
manufacturer and product codes available for identifying the physical part.

## Scope and contracts

- Rename **Single piece** to **Track parts** in **Add track**. Keep **Arrangement** for complete
  kits and layouts such as sidings, yards, and junctions. General layouts still start with the
  LEGO RC/PF S16 selected. NILTC layouts still open in Arrangement mode.
- Show **Straights**, **Curves**, **Switches**, **Crossings & crossovers**, and **Connectors** as
  visible choices. Show the selected category's cards in the existing panel. Let categories wrap.
  Use two columns where labels fit and one where they need the width. Keep the compact editor
  header and the phone's **Add track** and drawing navigation.
- Give each card a 16:9 top-down preview, a plain label such as **Straight (16 studs)**, and
  secondary manufacturer and model text so members can match it to their inventory. Order
  straights by measured length. Label curves with radius and turn angle, orient switch previews
  with the same approach direction, and say whether a crossing or crossover changes tracks.
- Lead each group with a complete part and offer equivalent brand options on demand. Group only
  parts with matching connection geometry and routes. Keep connectors and short fillers easy
  to find. Put replacement sections behind **More track parts** and direct users to **Arrangement**
  for complete multipart products such as the R104 turnout. Keep every currently placeable part
  reachable.
- Keep category navigation separate from selection. Selecting a card or brand variant updates the
  named selection and its **Connecting end** options. Keep the selected part and **Place** action
  easy to reach after browsing, including on a phone. Preserve **Place at**, snapping, the drawing
  preview, and the ability to cancel. Check that switching categories, parts, or layouts cannot
  leave a stale preview ready to place.
- Use labeled controls with visible focus and selection states. Support keyboard operation and
  keep the current touch target sizing. Give previews accompanying text so users can identify a
  part without the image.

## Architecture boundaries and ownership

Store category, plain label, and browsing visibility as explicit catalog data. Identify equivalent
variants and their default explicitly where groups exist. The picker owns browsing and reports
the selected catalog ID to the placement controller. That ID drives the named selection, connector
choices, preview, and committed part.
Render thumbnails from existing track geometry with a padded, aspect-preserving view. The
catalog's physical geometry, stored IDs, and LDraw file format stay stable.

## File scope

| File or directory | Intended change | Canonical source, for generated output |
| --- | --- | --- |
| `data/catalog.json`, `src/project.ts`, [CATALOG_SOURCES.md](../../data/CATALOG_SOURCES.md) | Add and document browse metadata. | |
| `src/index.html`, `src/track_part_picker.css`, `src/editor_track.ts`, `src/editor_arrangements.ts` | Add the picker, reuse shared control styles, and wire selection to placement. Update arrangement follow-up copy. | |
| `src/scene_appearance.ts` and picker module | Reuse vector track drawings for card previews. | Catalog geometry and existing vector track artwork |
| `tests/test_catalog.mjs`, `tests/playwright/` | Cover meaningful catalog and placement contracts. Update capture selectors. | |
| [USAGE.md](../USAGE.md), [SCREENSHOTS.md](../SCREENSHOTS.md), `docs/screenshots/`, [CHANGELOG.md](../CHANGELOG.md) | Describe the new flow and refresh affected captures. | Local Pages build and existing screenshot harness |

## Milestones

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| 1 | Classify the catalog | Assign all currently placeable entries a browsing home. Review example cards for LEGO S16, left and right switches, a crossing, a lane-changing crossover, and an R104 switch section. | Each choice describes the route and leads to the correct part or complete arrangement. |
| 2 | Build and connect the picker | Wire category controls, previews, variants, and placement through one selected part ID. Retain the existing General and NILTC entry points. | Members can choose by shape and place the exact part they selected. |
| 3 | Verify the flows and refresh docs | Check keyboard, touch, selected state, variant placement, part changes during preview, and existing arrangement placement. Capture at 1600 by 1000 and 390 by 844 and inspect readable labels, previews, and drawing space. Run `npm run check`, `./devel/verify_release.sh`, and `source source_me.sh && python3 -m pytest tests/`. | The picker fits the panel at both sizes and preserves editing behavior. |
| 4 | Walk through newcomer tasks | Ask first-time members, when available, to find a standard straight, a right-branching switch, and a way to change tracks. Record first category, wrong selections, and time to the correct part. Use recurring errors to tune labels and grouping. | Distinguish observed usability from the implementation walkthrough. |

## Verification outcome

The implementation has catalog and browser coverage for browsing and exact part placement.
The screenshot guide shows the new picker on desktop and phone. First-time member walkthroughs
remain pending participant availability.

*Plan created with `vosslab-skills:medium-plan-drafter`.*
