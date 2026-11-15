// Copies the homepage (../website) into public/homepage/. English pages are
// served at /homepage and /homepage/<page>, Japanese ones (website/ja/) at
// /homepage/ja and /homepage/ja/<page>. A signed-out visitor to / is sent to
// /homepage.
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
mkdirSync(join(out, 'ja'), { recursive: true });

// website/ links pages by file name so it previews as files. Here they become
// URLs: index.html -> /homepage, timeline.html -> /homepage/timeline, and the
// same under /homepage/ja for the Japanese pages.
const url = (base, file) => {
  const [name, hash = ''] = file.split('#');
  const page = name.replace(/\.html$/, '');
  return (page === 'index' ? base : `${base}/${page}`) + (hash ? `#${hash}` : '');
};
const rewrite = (html, ja) =>
  html
    .replace(/(src|href)="(\.\.\/)?assets\//g, '$1="/homepage/assets/')
    .replace(/href="\.\.\/([a-z-]+\.html(?:#[\w-]+)?)"/g, (_, f) => `href="${url('/homepage', f)}"`)
    .replace(/href="ja\/([a-z-]+\.html(?:#[\w-]+)?)"/g, (_, f) => `href="${url('/homepage/ja', f)}"`)
    .replace(/href="([a-z-]+\.html(?:#[\w-]+)?)"/g, (_, f) => `href="${url(ja ? '/homepage/ja' : '/homepage', f)}"`);

for (const [dir, ja] of [['', false], ['ja', true]]) {
  for (const page of readdirSync(join(from, dir)).filter((f) => f.endsWith('.html'))) {
    writeFileSync(join(out, dir, page), rewrite(readFileSync(join(from, dir, page), 'utf8'), ja));
  }
}
for (const file of readdirSync(join(from, 'assets'))) copyFileSync(join(from, 'assets', file), join(out, 'assets', file));
