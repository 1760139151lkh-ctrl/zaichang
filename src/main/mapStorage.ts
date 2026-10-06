/** Desktop I/O boundary. Review aliases only this module to an immutable public store. */
export { readFileSync, statSync } from 'node:fs';
export { createHash } from 'node:crypto';
export { default as path } from 'node:path';
