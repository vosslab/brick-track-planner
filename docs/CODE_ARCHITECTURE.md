# Code architecture

## Overview

The browser planner designs one member's track plan inside one assigned display
area. TypeScript owns project editing and rendering. Rust/Wasm evaluates track
geometry, physical joins, routes, NILTC constraints, and area coverage.

## Major components

- [`../src/main.ts`](../src/main.ts) starts the browser editor and coordinates
  input, undoable state changes, rendering, and exports.
- [`../src/project.ts`](../src/project.ts) defines and validates the single-area
  project passed between the editor and Rust. [`../src/ldraw.ts`](../src/ldraw.ts)
  reads and writes editable LDraw track plans.
- [`../src/area_form.ts`](../src/area_form.ts) and
  [`../src/niltc_starters.ts`](../src/niltc_starters.ts) create a member's
  assigned area and protected straight or corner mainline.
- [`../src/editor_track.ts`](../src/editor_track.ts) and
  [`../src/editor_arrangements.ts`](../src/editor_arrangements.ts) place
  physical parts and complete track arrangements.
- [`../src/arrangements.ts`](../src/arrangements.ts),
  [`../src/parking.ts`](../src/parking.ts),
  [`../src/drive_through_yard.ts`](../src/drive_through_yard.ts), and
  [`../src/turnback_wye.ts`](../src/turnback_wye.ts) describe buildable
  parking, yard, crossover, and turnback arrangements.
- [`../src/scene.ts`](../src/scene.ts),
  [`../src/scene_appearance.ts`](../src/scene_appearance.ts), and
  [`../src/scene_drawing.ts`](../src/scene_drawing.ts) draw the design area,
  derived baseplate grid, track, routes, and diagnostics.
- [`../rust/lib.rs`](../rust/lib.rs) exposes the Rust evaluator. Its model,
  ports, routes, coverage, and NILTC modules implement the authoritative
  geometry checks.
- [`../data/catalog.json`](../data/catalog.json) supplies part geometry,
  connector ports, internal rail routes, and expandable kits.

## Data flow

1. A starter, LDraw template, or reopened plan supplies one `Project` with one `area`.
2. Editor tools add individual physical track items in area coordinates.
3. [`../src/engine.ts`](../src/engine.ts) sends the project and catalog to the
   Rust/Wasm evaluator.
4. The evaluator returns joins, collisions, routes, NILTC findings, and
   inventory data.
5. The scene, diagnostics, parts list, PDF, image exporters, and LDraw writer consume
   that same placed-track representation.

## Testing and verification

- [`../tests`](../tests) contains Node tests for the project contract,
  arrangements, catalog, route tracing, and exports.
- [`../tests/playwright`](../tests/playwright) covers the member workflow in a
  staged browser build.
- [`../check_codebase.sh`](../check_codebase.sh) runs the repository checks.
- [`../build_github_pages.sh`](../build_github_pages.sh) builds the Wasm
  bindings and Pages artifact used by browser tests.

## Extension points

- Add a physical part, its ports, paths, routes, and source evidence in
  [`../data/catalog.json`](../data/catalog.json) and
  [`../data/CATALOG_SOURCES.md`](../data/CATALOG_SOURCES.md).
- Add a reusable arrangement as a placement of those parts in
  [`../src/arrangements.ts`](../src/arrangements.ts), with focused geometry
  tests in [`../tests`](../tests).
- Keep new checks in the Rust evaluator when they affect geometry, connectivity,
  routes, or NILTC compliance.
