# Changelog

## 2026-11-24

### Additions and New Features

- Documented the v1 setup flow, planned geometry, project format, and supported sharing formats.
- Recorded the NILTC presets, section seam guides, and local TypeScript / stateless Rust-Wasm
  boundary.
- Added a source-backed LEGO, BrickTracks, and TrixBrix catalog, including TrixBrix S8/S32 and its
  one-section R120 placement unit (two printed pieces per section); TrixBrix S16 is not in the
  verified catalog.
- Added scene fit diagnostics and PNG, WebP, PDF, and LDraw sharing flows with visible inventory and
  unresolved-item reporting.

### Behavior or Interface Changes

- The Pages build now locks npm dependencies, builds the Wasm module and TypeScript declarations,
  and stages Wasm and examples in `dist/`.
- Added `./devel/verify_release.sh` for local release checks. The canonical Pages workflow verifies
  pull requests, pushes to `main`, and manual runs; deployment runs only on `main` or manual
  dispatch from the default branch.
- Documented the GitHub setup: copy root `deploy-pages.yml` to
  `.github/workflows/deploy-pages.yml` through the GitHub browser and set Pages source to GitHub
  Actions.
- Documented the native +/-100,000-stud pose bound and table/unresolved-object dimension bounds,
  validation-before-open behavior, full-visible-scene exports, 2,400-pixel raster cap, and the
  absence of a separate export coordinate cutoff. Turnout swap guidance covers common-port
  preservation for supported single-body swaps, TrixBrix multi-part assemblies, preview
  invalidation after alignment or seam repair, and the scene's joined, open, and ambiguous endpoint
  symbols.

### Developer Tests and Notes

- The first `./build_github_pages.sh` run generates Wasm TypeScript declarations; run it before
  standalone `./check_codebase.sh` checks.
- Initial `npm ci`, npm audit, and package policy checks passed; npm audit reported no known
  vulnerabilities.
- Browser acceptance setup is `npx playwright install chromium webkit`; Linux system dependencies
  can be installed with `npx playwright install --with-deps chromium webkit`.
