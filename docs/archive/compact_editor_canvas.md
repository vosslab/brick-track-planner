# Plan: Give the track drawing about 70% of the screen

## Context

The Back-out siding first-open capture at 390 by 844 shows only 64 CSS pixels
of drawing height, or 7% of the frame. Setup gives each dimension select about
164 CSS pixels and clips "baseplates." On desktop, a three-column editor and
stacked commands leave the drawing 26% of the 1280 by 800 baseline frame.

## Objectives

- Use about 70% of the first-open frame as a rough design reference for the
  drawing at 390 by 844 and 1600 by 1000.
- Show the complete initial plan and the full width and depth option labels.
- Preserve the editing, placement, independent layout tab, save, and export workflows.

## Design philosophy

Group secondary commands by task and display editing actions when they apply.
Use labeled controls for File, Layout, Tools, and panel navigation. Give Undo,
Redo, and icon-based camera controls crisp vector glyphs with keyboard and
pointer tooltips. Preserve comfortable touch targets and visible focus.

## Scope

- Keep Save beside File in the header. File contains Open, Import BlueBrick,
  New design, Browse examples, templates, and export controls.
- Keep layout tabs visible. Layout contains rename, dimensions, Design area,
  Duplicate plan, and Close layout.
- Put secondary track commands in Tools. Show Move, Copy, Delete, Paste, and
  placement instructions according to their existing availability.
- Use one Add track / Inspector sidebar on desktop. At 750 CSS pixels and
  below, show both panels below the drawing and provide explicit navigation.
- Stack Setup's preset and custom dimension fields when they need more width.

## Non-goals

Use the existing track geometry, camera, project and export formats, and
Rust/Wasm bindings.

## Approach

1. Restructure the editor HTML and CSS around a single compact command row on
   desktop and two on phones. Use native disclosures and keep each command's
   existing ID and handler. Give the view controls their own phone row.
2. Connect disclosure dismissal, tooltip dismissal, focus return, panel
   navigation, and the conditional editing controls in the browser layer.
   Show the top of the editor when the first plan opens from Setup. Keep each
   layout's existing view and history during tab switches.
3. Update the existing browser flows for their new command locations. Run
   the capture harness, refresh affected documentation and screenshots,
   and record the change in the changelog.

## Verification

- Measure the on-screen unobstructed drawing area against the full frame using
  the same Back-out siding at both reference sizes. Check 390 by 844 Setup in
  Chromium and WebKit. Review clipping, focus, visual hierarchy, and safe
  reflow below and above the phone breakpoint.
- Walk through first open, panel navigation, touch editing, keyboard
  dismissal, saved-plan reopen, export, and cross-layout copy and paste.
  Keep one focused phone regression for drawing reachability.
- Run `npm run check` and `./devel/verify_release.sh`. Use the area
  measurements to compare layouts alongside clipping and visual hierarchy.

## Results

- The Back-out siding drawing occupies 68.94% of the 390 by 844 frame in
  Chromium and WebKit and 69.30% of the 1600 by 1000 desktop frame in
  Chromium, excluding the desktop view controls.
- The phone captures show the complete fitted layout and baseplate labels.
  The desktop capture uses an exact 16:10 frame. All 35 managed images were
  regenerated with the capture harness.
- The codebase check, local release verifier, and Markdown link checks pass.
  Browser probes also cover menu and tooltip dismissal, stable mouse drag
  bounds, and overflow at 320, 360, 750, and 751 CSS pixels.
