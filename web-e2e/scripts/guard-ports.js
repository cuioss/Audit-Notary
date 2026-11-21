#!/usr/bin/env node
/**
 * Fails when a port literal of the suite appears outside tests/helpers/ports.js, so a port is changed in one
 * place only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set([
  path.join('tests', 'helpers', 'ports.js'),
  path.join('scripts', 'guard-ports.js'),
]);
const PORT = /\b(5173|7420)\b/;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'target', 'test-results', 'playwright-report'].includes(entry.name))
      return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : entry.name.endsWith('.js') ? [full] : [];
  });
}

const offenders = files(ROOT)
  .map((file) => path.relative(ROOT, file))
  .filter(
    (file) => !ALLOWED.has(file) && PORT.test(fs.readFileSync(path.join(ROOT, file), 'utf8')),
  );

if (offenders.length > 0) {
  console.error(
    `guard-ports: port literal outside tests/helpers/ports.js in ${offenders.join(', ')}`,
  );
  process.exit(1);
}
console.info('guard-ports: ports are named in tests/helpers/ports.js only');
