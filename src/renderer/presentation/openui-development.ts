/**
 * react-lang 1.0.1 checks this realm-wide guard before importing its automatic
 * development widget. Keep that optional inspector out of the product, including
 * dev builds, without changing parsing, rendering, or error reporting. This must
 * run before the first react-lang import. Recheck the guard on a version upgrade.
 * Source: packages/react-lang/src/devtoolsBootstrap.ts in thesysdev/openui.
 */
const flags = globalThis as typeof globalThis & { [key: symbol]: boolean | undefined };
flags[Symbol.for('openui.devtools.autoMount')] = true;

export {};
