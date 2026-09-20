/**
 * ReconKit — build & packaging script.
 * 1. Runs the test suite (aborts on failure).
 * 2. Validates manifest.json (structure, referenced files, extension ID).
 * 3. Packages a clean web-ext-compatible zip into dist/ using the system
 *    `zip` tool, excluding repo-only files.
 *
 * Run: npm run build
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MANIFEST = join(ROOT, 'manifest.json');

const EXCLUDED = [
  '.git', 'node_modules', 'test', 'tools', 'docs', 'dist',
  'README.md', 'package.json', 'package-lock.json', '.gitignore'
];

function step(msg) { console.log(`\n== ${msg} ==`); }

/* ---------- 1. tests ---------- */
step('Running test suite');
const t = spawnSync(process.execPath, [join(ROOT, 'test', 'run-tests.mjs')], { cwd: ROOT, stdio: 'inherit' });
if (t.status !== 0) {
  console.error('\nBuild aborted: tests failed.');
  process.exit(1);
}

/* ---------- 2. manifest validation ---------- */
step('Validating manifest');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const gecko = (manifest.browser_specific_settings || {}).gecko || {};
if (gecko.id !== 'reconkit@zishanhack.com') {
  console.error('Extension ID must be reconkit@zishanhack.com.');
  process.exit(1);
}
const required = ['manifest_version', 'name', 'version', 'permissions', 'background', 'action'];
for (const key of required) {
  if (manifest[key] === undefined) { console.error(`manifest missing "${key}"`); process.exit(1); }
}
const unexpectedPerms = new Set([
  'webRequest', 'webRequestBlocking', 'proxy', 'debugger', 'nativeMessaging', 'downloads'
]);
const violations = (manifest.permissions || []).filter((p) => unexpectedPerms.has(p));
if (violations.length) {
  console.error('Unexpected (over-reaching) permissions requested:', violations.join(', '));
  process.exit(1);
}
if (manifest.sidebar_action) {
  console.error('ReconKit uses an action popup; remove "sidebar_action".');
  process.exit(1);
}

/* referenced files must exist */
const refs = new Set();
const addRefs = (o) => {
  if (!o || typeof o !== 'object') return;
  for (const v of Object.values(o)) {
    if (typeof v === 'string' && /^(app|background|content|lib|services|icons)\//.test(v)) refs.add(v);
    else addRefs(v);
  }
};
addRefs(manifest);
let missing = 0;
for (const ref of refs) {
  if (!existsSync(join(ROOT, ref))) { console.error(`Missing referenced file: ${ref}`); missing++; }
}
if (missing) process.exit(1);

/* known-libs sanity: every app script tag library must exist */
const appHtml = readFileSync(join(ROOT, 'app', 'app.html'), 'utf8');
const scriptSrcs = [...appHtml.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
for (const s of scriptSrcs) {
  if (!existsSync(join(ROOT, 'app', s))) { console.error(`Missing app script: ${s}`); process.exit(1); }
}
console.log(`manifest OK — ${manifest.name} v${manifest.version} (${gecko.id})`);

/* ---------- 3. packaging ---------- */
step('Packaging');
mkdirSync(DIST, { recursive: true });
const zipName = `reconkit-${manifest.version}.zip`;
const zipPath = join(DIST, zipName);
if (existsSync(zipPath)) { spawnSync('rm', [zipPath]); }

function walk(dir, base, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    if (EXCLUDED.includes(entry)) continue;
    const p = join(dir, entry);
    const rel = relative(ROOT, p);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(rel);
  }
  return out;
}
const files = walk(ROOT).filter((f) => !f.startsWith('icons') || f.endsWith('.png'));
const args = ['-r', '-q', zipPath, ...files.map((f) => f.replace(/\\/g, '/'))];
const z = spawnSync('zip', args, { cwd: ROOT });
if (z.status !== 0) {
  console.error('zip failed — is the system `zip` utility installed?');
  console.error(z.stderr ? z.stderr.toString() : '');
  process.exit(1);
}
const size = statSync(zipPath).size;
console.log(`\nPackage: ${zipPath} (${(size / 1024).toFixed(1)} KiB, ${files.length} files)`);
console.log(`Load in Firefox: about:debugging → This Firefox → Load Temporary Add-on → ${zipName}`);
console.log('Lint with: npm run lint   (web-ext lint)');