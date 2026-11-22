#!/usr/bin/env node
/**
 * Checks the build output (run by `npm run build`):
 *
 * - `build/index.html` exists and carries SvelteKit's Content Security Policy `<meta>` with the hash of the
 *   bootstrap script and without `unsafe-inline` (AUN-WEB-8);
 * - no HTML or CSS file loads a resource from another origin (AUN-WEB-1);
 * - `build/_app/immutable` holds the bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
const failures = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const index = path.join(root, 'index.html');
if (!fs.existsSync(index)) {
  failures.push('build/index.html is missing');
} else {
  const html = fs.readFileSync(index, 'utf8');
  const meta = /<meta http-equiv="content-security-policy" content="([^"]+)"/i.exec(html);
  if (!meta) {
    failures.push('build/index.html carries no content-security-policy <meta>');
  } else {
    if (!/script-src 'self' 'sha256-/.test(meta[1])) {
      failures.push(`the policy admits no bootstrap hash: ${meta[1]}`);
    }
    if (meta[1].includes('unsafe-inline')) {
      failures.push(`the policy admits unsafe-inline: ${meta[1]}`);
    }
  }
}

if (!fs.existsSync(path.join(root, '_app', 'immutable'))) {
  failures.push('build/_app/immutable is missing');
}

/** The openings after which a URL follows in HTML and CSS. */
const OPENINGS = [
  'src="',
  "src='",
  'href="',
  "href='",
  'url(',
  'url("',
  "url('",
  '@import "',
  "@import '",
];

/**
 * @param {string} text an HTML or CSS file
 * @returns {boolean} whether it references an absolute or protocol-relative URL
 */
function referencesForeignOrigin(text) {
  const lower = text.toLowerCase();
  return OPENINGS.some((opening) => {
    for (let at = lower.indexOf(opening); at !== -1; at = lower.indexOf(opening, at + 1)) {
      const rest = lower.slice(at + opening.length, at + opening.length + 8);
      if (rest.startsWith('http://') || rest.startsWith('https://') || rest.startsWith('//')) {
        return true;
      }
    }
    return false;
  });
}

if (fs.existsSync(root)) {
  for (const file of walk(root).filter((name) => /\.(html|css)$/.test(name))) {
    if (referencesForeignOrigin(fs.readFileSync(file, 'utf8'))) {
      failures.push(`${path.relative(root, file)} loads a resource from another origin`);
    }
  }
}

if (failures.length > 0) {
  console.error(`check-build-output: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.info('check-build-output: index.html, policy, bundle and origins are fine');
