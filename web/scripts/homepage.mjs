// Copies the homepage (../website) into public/homepage/, where the app serves
// it at /homepage (English, index.html) and /homepage/ja (Japanese, ja.html).
// A signed-out visitor to / is sent to /homepage.
//
// website/ links its images as assets/…; served from /homepage they become
// /homepage/assets/…. Generated output is not committed (.gitignore).
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(web, '..', 'website');
const out = join(web, 'public', 'homepage');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });

for (const page of readdirSync(from).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(join(from, page), 'utf8').replace(/(src|href)="assets\//g, '$1="/homepage/assets/');
  writeFileSync(join(out, page), html);
}
for (const file of readdirSync(join(from, 'assets'))) copyFileSync(join(from, 'assets', file), join(out, 'assets', file));
