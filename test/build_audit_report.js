/* build_audit_report.js — merge test/audit-examples.json + test/audit-basecheck.json
 * into test/audit-examples.md (final human-readable report). */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = process.env.AUDIT_OUT || 'audit-examples';
const audit = JSON.parse(fs.readFileSync(path.join(__dirname, OUT + '.json'), 'utf8'));
const base = JSON.parse(fs.readFileSync(path.join(__dirname, OUT + '-basecheck.json'), 'utf8'));

const reach = new Map();
for (const r of base.results) reach.set(r.id, r);

const order = ['ACTIVE', 'PARTIAL', 'INACTIVE'];
const results = audit.results;
results.sort((a, b) => order.indexOf(a.status.level) - order.indexOf(b.status.level) || a.id.localeCompare(b.id));

const lines = [];
const stamp = new Date(audit.generatedAt);
lines.push('# Examples/ — Sora module audit (' + stamp.toLocaleString() + ')');
lines.push('');
lines.push('Every module folder under `examples/` (excluding `.archive`, `.tools`, `.gitea`) was loaded locally with a `fetchv2`/curl sandbox and run through its full contract pipeline. Keywords: `one piece` (video/manga), `solo leveling` (novels), with per-site overrides. A site "UP/DOWN" column shows whether its `baseUrl` responded from this environment — DOWN ≠ module broken, UP + 0 results = search endpoint/regex issue or JS-gated content.');
lines.push('');
lines.push('| Status | Count |');
lines.push('| --- | --- |');
for (const lv of order) lines.push('| **' + lv + '** | ' + results.filter(r => r.status.level === lv).length + ' |');
lines.push('');

function stepFails(r) {
  const parts = [];
  for (const k of Object.keys(r.steps)) {
    const s = r.steps[k];
    if (s && !s.ok) parts.push(k + (s.error ? ': ' + s.error : ' (empty)'));
  }
  return parts;
}

for (const lv of order) {
  const group = results.filter(r => r.status.level === lv);
  lines.push('## ' + lv + (lv === 'ACTIVE' ? ' — full pipeline resolves' : (lv === 'PARTIAL' ? ' — search works, later step fails' : ' — search/load fails')));
  lines.push('');
  lines.push('| Module | Site | Steps |');
  lines.push('| --- | --- | --- |');
  for (const r of group) {
    const b = reach.get(r.id);
    let site = '?';
    if (b) {
      if (!b.url) site = 'n/a';
      else if (b.ok) site = 'UP';
      else site = 'DOWN' + (b.code ? '/' + b.code : '');
    }
    const steps = Object.keys(r.steps)
      .filter(k => r.steps[k])
      .map(k => r.steps[k].ok ? '✓' + k : '✗' + k)
      .join(' ');
    let detail = r.status.reason || '';
    const fails = stepFails(r);
    if (fails.length) detail = fails.join('; ');
    lines.push('| `' + r.id + '` | ' + site + ' | ' + steps + ' — ' + detail + ' |');
  }
  lines.push('');
}

/* Failure-reason breakdown */
lines.push('## Failure reasons');
lines.push('');
const reasonTable = {};
for (const r of results) {
  if (r.status.level !== 'INACTIVE' && r.status.level !== 'PARTIAL') continue;
  const key = (r.status.reason || '').replace(/^search → |\s*\(.*?\)$/g, '').replace(/ \(.*$/, '');
  reasonTable[key] = reasonTable[key] || [];
  reasonTable[key].push(r.id);
}
lines.push('| Reason | Modules |');
lines.push('| --- | --- |');
for (const [reason, ids] of Object.entries(reasonTable).sort((a, b) => b[1].length - a[1].length)) {
  lines.push('| ' + reason + ' | ' + ids.length + ': `' + ids.join('`, `') + '` |');
}
lines.push('');

/* ACTIVE stream/chapter evidence */
lines.push('## Evidence — ACTIVE modules');
lines.push('');
for (const r of results.filter(r => r.status.level === 'ACTIVE')) {
  const b = reach.get(r.id);
  const site = b ? (b.ok ? 'UP' : 'DOWN/' + (b.code || '')) : '?';
  lines.push('**`' + r.id + '`** (' + r.source + ', ' + r.type + ', ' + r.keyword + ', site ' + site + ')');
  if (r.steps.search && r.steps.search.sample && r.steps.search.sample.length) {
    lines.push('- search: ' + r.steps.search.count + ' results, e.g. ' + r.steps.search.sample.slice(0, 3).join(' | '));
  }
  const stream = r.steps.stream;
  if (stream && stream.sample && stream.sample.length) {
    lines.push('- stream: ' + stream.count + ' source(s), e.g. `' + stream.sample[0] + '`');
  }
  const img = r.steps.images;
  if (img) lines.push('- images: ' + img.count);
  const txt = r.steps.text;
  if (txt) lines.push('- text: ' + txt.length + ' chars');
}
lines.push('');

fs.writeFileSync(path.join(__dirname, OUT + '.md'), lines.join('\n'));
console.log('Wrote ' + path.join(__dirname, OUT + '.md') + ' (' + results.length + ' modules)');
console.log('SUMMARY: ' + Object.entries(audit.summary).map(([k, v]) => k + '=' + v).join('  '));