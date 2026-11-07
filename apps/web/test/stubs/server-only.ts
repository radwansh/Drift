/**
 * A no-op stand-in for the `server-only` package.
 *
 * `server-only` exists to make a build fail if a server module is imported
 * into a client bundle. It has no runtime behaviour, and it does not resolve
 * under vitest, so any test importing a module that reaches
 * `src/config/environment.ts` dies at collection with "Failed to load url
 * server-only" before a single assertion runs.
 *
 * Aliased in `vitest.config.ts`. This does not weaken the guarantee: the check
 * that matters is `next build`, which still sees the real package.
 */
export {};
