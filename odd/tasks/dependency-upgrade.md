# Dependency upgrade: close Dependabot alerts

Update every dependency to its latest version with exact pins, and resolve all 57 open Dependabot alerts (2 in package.json, 55 in pnpm-lock.yaml) without breaking the site.

## Specs

- S1. "actualicemos todas a la última versión fijas": every dependency and devDependency in `package.json` is updated to its latest stable published version, pinned exactly (no `^`/`~`).
- S2. "revisa eso de dependabot que nos pide": every open Dependabot alert is resolved in `pnpm-lock.yaml`/`package.json`. Direct: astro must be >= 7.4.7. Transitive minimum patched versions: follow-redirects 1.16.2, undici 8.12.2, fast-uri 3.1.9, zod 4.6.6, vite 8.2.4, devalue 5.9.3, sharp 0.35.5, smol-toml 1.9.0, source-map-js 1.2.2, js-yaml 4.3.2, baseline-browser-mapping 2.11.0, svgo 4.1.0, browserslist 4.28.7, @babel/core 7.29.6, picomatch 2.3.2 (and any 2.x/4.x copies at patched versions), ajv 8.18.0. Prefer getting them through updated parents; use `pnpm.overrides`/`overrides` in pnpm-workspace.yaml only where a parent still pins a vulnerable range, and pin overrides exactly. `pnpm audit` reports 0 vulnerabilities.
- S3. "que no tenga problemas de ningún tipo": `pnpm install --frozen-lockfile` works from a clean state, `pnpm build` exits 0, `node --test tests/room/ tests/world/` has 0 failures, `pnpm exec astro check` introduces no new errors versus before the upgrade, `pnpm exec biome check ./src` introduces no new errors. Breaking changes from major updates are fixed in source, not hidden.

## Tasks

- T1. S1-S3 — route: gentle-ai-worker + gentle-ai-verify (Risk item 5, dependencies) — verified: S1-S3 pass; lucide-react bumped to 1.74.0 after verify (published same day); astro check crashes on TypeScript 7 before and after (pre-existing) — commit: see git log

## Log

- L1. User request (verbatim): "lisoto , ahora tengamolos ahi merge a main sin push por ahora por que quiero que revisemos eso de denpendabot que esta qeu nos pide per de cosas nbose que dependencia esta con eso por fa revialo y actulicemos todas a la ultima version fijas porfa y que no tenga n problemas de nningun tiipo"
- L2. Done: feat/portfolio-new-projects merged into local main (cb97767), not pushed. Open Dependabot PRs #46 (devalue), #47 (axios), #48 (astro) are superseded by this task; closing them is a remote action left to the user.
- L3. Baseline: Node v26.13.1, pnpm 12.4.2, package.json already exact-pinned (astro 7.3.3, axios 1.20.0, typescript 7.0.2, ...).
- L4. T1 worker: `pnpm up --latest` (exact pins kept); only major was @astrojs/react 6→7 (drops the `babel` option, unused here). `pnpm audit` 55 → 0 with no overrides; js-yaml, browserslist, baseline-browser-mapping and @babel/core left the tree along with Babel. Source fixes: LAZY_PLUGINS versions in src/lib/world/nvim-editor.ts (enforced by tests/world/nvim.test.ts), biome.json schema 2.6.8 + `recommended:false` → `preset:"none"` (biome migrate). Checks: build 0, tests 1234/0 fail/1 skip, biome 3 errors (same pre-existing ones), astro check exit 1 before and after (TypeScript 7 has no programmatic API, so it checks nothing). The clean install used `--frozen-lockfile --force` because removing node_modules was blocked for the worker.
- L5. lucide-react 1.74.0 (published 2026-11-17) violates pnpm minimumReleaseAge: a lockfile pinning it fails `pnpm add`/fresh resolution with ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION. Pinned back to 1.73.0, the latest version the supply-chain policy accepts; `pnpm outdated` empty, audit 0, clean frozen install, build and 1234/1235 tests pass.
