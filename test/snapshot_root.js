/* snapshot_root.js — copy every module folder in the repo root into a temp dir
 * so the audit harness (AUDIT_DIR) can verify the ACTUAL shipped library.
 *
 * Usage: node test/snapshot_root.js [<destDir>]   (default: test/_root-snapshot)
 * Skips non-module dirs (git, test, documentation, modules, git.luna-app.eu, .*).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = process.argv[2] || path.join(__dirname, '_root-snapshot');
const SKIP = new Set(['.git', '.github', '.cursor', '.playwright-mcp', 'test',
  'documentation', 'modules', 'git.luna-app.eu', 'node_modules']);

fs.rmSync(DEST, { recursive: true, force: true });

const looksLikeModule = dir => {
  try {
    return fs.readdirSync(dir).some(f => f.endsWith('.json') && (() => {
      try { return /"script(Url|URL)"|"sourceName"/.test(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch (e) { return false; }
    })());
  } catch (e) { return false; }
};

let n = 0;
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
  const src = path.join(ROOT, e.name);
  if (!looksLikeModule(src)) continue;
  fs.cpSync(src, path.join(DEST, e.name), { recursive: true });
  n++;
}
console.log('Snapshotted ' + n + ' module folders -> ' + DEST);
console.log('Audit with:  $env:AUDIT_DIR="' + DEST + '"; $env:AUDIT_OUT="audit-root-full"; node test/audit_examples.js');