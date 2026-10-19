// tests/helpers/next-resolve.mjs — an ESM resolve hook so plain node can load
// App Router route files.
//
// THE PROBLEM. Route handlers import `next/server` with no extension. Next 16
// ships no `exports` map in its package.json, so that specifier only resolves
// through Next's own bundler; under `node --test` it is ERR_MODULE_NOT_FOUND
// ("Did you mean next/server.js?"). That single missing extension is why no
// test in this repo had ever invoked a route handler — not any deeper
// architectural obstacle.
//
// THE FIX. Retry a failing bare `next/<subpath>` specifier with `.js`
// appended. Deliberately narrow:
//   * only specifiers beginning `next/`
//   * only after the normal resolution has already FAILED
//   * never rewrites app or lib specifiers
// So it cannot silently change which module any project file resolves to; it
// only rescues the exact case node has no answer for.
//
// Registered at runtime by tests/helpers/route.js via module.register(), so
// `npm test` needs no flags and no other test file is affected.

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isBareNextSubpath = /^next\/[^/]/.test(specifier) && !specifier.endsWith(".js");
    if (!isBareNextSubpath || error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return nextResolve(`${specifier}.js`, context);
  }
}
