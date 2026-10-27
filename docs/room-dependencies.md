# Room rendering dependencies

The room uses Three.js 0.186.1, React Three Fiber 9.8.2, Drei 10.7.9 and
Meshoptimizer 1.3.0. Fiber 9 supports the project's React 19.3; Drei 10 supports
Fiber 9. Versions are pinned in `package.json` and `pnpm-lock.yaml`.

The lazy room uses the locally installed Meshopt decoder. Its rendering modules
are explicitly included in Vite's dependency optimization to avoid development
HTTP 504 `Outdated Optimize Dep` errors on the first scene import.

No remote environment map, font, decoder, or GSAP dependency is required.
The existing TypeScript 7 / `baseUrl` configuration failure remains unresolved;
a successful Astro build is not a standalone TypeScript check.
