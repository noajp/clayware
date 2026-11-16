#!/usr/bin/env node
// Prints the design tokens as they stand now, read from the source files, so
// the skill never carries a copy that drifts.
//
//   node .claude/skills/clayware-design/scripts/tokens.mjs            # every role, light and dark
//   node .claude/skills/clayware-design/scripts/tokens.mjs accent     # roles whose name contains "accent"
//   node .claude/skills/clayware-design/scripts/tokens.mjs --site     # the marketing site's tokens
//   node .claude/skills/clayware-design/scripts/tokens.mjs --check    # app ↔ site key blue, label ↔ status overlaps
//
// Run from the repository root (or any worktree root).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const APP = join(root, 'web/src/app/globals.css');
const SITE = join(root, 'website/assets/tokens.css');
const LABELS = join(root, 'web/src/Function/shared/labelColor.ts');
if (!existsSync(APP)) {
  console.error('Run from the repository root: web/src/app/globals.css not found.');
  process.exit(1);
}

/** The declarations of the first block whose selector list contains `selector`. */
function block(css, selector) {
  const re = /([^{};]+)\{([^{}]*)\}/g;
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let m;
  while ((m = re.exec(clean))) {
    const sels = m[1].split(',').map((s) => s.trim());
    if (sels.includes(selector)) return decls(m[2]);
  }
  return {};
}
function decls(body) {
  const out = {};
  for (const d of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const k = d.slice(0, i).trim();
    if (k.startsWith('--')) out[k] = d.slice(i + 1).trim();
  }
  return out;
}

const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith('--'));
const pick = (o) => Object.entries(o).filter(([k]) => !filter || k.includes(filter));

if (args.includes('--site')) {
  const css = readFileSync(SITE, 'utf8');
  const dark = block(css, ':root');
  const light = block(css, '[data-mode="light"]');
  console.log('token'.padEnd(30), 'dark (default)'.padEnd(34), 'light');
  for (const [k, v] of pick(dark)) console.log(k.padEnd(30), v.padEnd(34), light[k] ?? '');
  process.exit(0);
}

const css = readFileSync(APP, 'utf8');
const light = block(css, ':root');
const dark = block(css, '.dark');

if (args.includes('--check')) {
  const site = readFileSync(SITE, 'utf8');
  const fill = block(site, ':root')['--color-accent-fill'];
  console.log('app  --accent-default     ', light['--accent-default']);
  console.log('site --color-accent-fill  ', fill, '(should be the same blue, in oklch)');
  const labels = [...readFileSync(LABELS, 'utf8').matchAll(/key: '(\w+)'.*?hex: '(#[0-9a-f]{6})'/gi)];
  const statusHex = Object.entries(light).filter(([k, v]) => /^--(status|element-status)-[a-z-]+$/.test(k) && /^#/.test(v));
  for (const [, key, hex] of labels) {
    for (const [k, v] of statusHex) {
      if (v.toLowerCase() === hex.toLowerCase()) console.log(`label ${key} ${hex} = ${k} — a label must not be read as that status`);
    }
  }
  process.exit(0);
}

console.log('token'.padEnd(36), 'light'.padEnd(44), 'dark');
for (const [k, v] of pick(light)) console.log(k.padEnd(36), v.padEnd(44), dark[k] ?? '(same)');
