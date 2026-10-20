// License gate: every installed package must use a permissive license (no
// copyleft / share-alike). Reads package-lock.json, so it sees the full tree
// without walking node_modules. Policy: ROADMAP.md, "Ground rules".
// Usage: npm run license:check
import { readFileSync } from 'node:fs';

const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'Unlicense',
  'CC0-1.0',
  'BlueOak-1.0.0',
]);

// Reviewed exceptions: build/test tooling only, never shipped, and not copyleft.
const EXCEPTIONS = {
  'caniuse-lite': 'CC-BY-4.0: attribution-only browser data used by build tooling',
  argparse: 'Python-2.0: permissive license, dev dependency of eslint',
};

/** True if an SPDX expression is satisfied by allowed licenses ("A OR B", "(A AND B)"). */
function permitted(expression) {
  const expr = expression.replace(/[()]/g, '').trim();
  if (expr.includes(' OR ')) return expr.split(' OR ').some((part) => permitted(part));
  if (expr.includes(' AND ')) return expr.split(' AND ').every((part) => permitted(part));
  return ALLOWED.has(expr);
}

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const problems = [];
let checked = 0;

for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path.includes('node_modules/') || pkg.link) continue; // root + our own workspaces
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const license = typeof pkg.license === 'string' ? pkg.license : 'UNKNOWN';
  checked++;
  if (permitted(license) || name in EXCEPTIONS) continue;
  problems.push(`${name}@${pkg.version}: ${license}${pkg.dev ? ' (dev)' : ''}`);
}

if (problems.length > 0) {
  console.error(`License check failed: ${problems.length} package(s) outside the allowlist:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`License check passed: ${checked} packages, all permissive.`);
