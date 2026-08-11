/**
 * Test stub for the `server-only` package.
 *
 * That package throws on import outside a Server Component, which is exactly
 * what makes it useful in the app and useless under Vitest. Modules that
 * legitimately read server configuration — the providers, the repositories —
 * would otherwise be untestable.
 *
 * Aliased in `vitest.config.mts`. This does not weaken the real guarantee:
 * the production build still fails if a client component imports server code.
 */
export {};
