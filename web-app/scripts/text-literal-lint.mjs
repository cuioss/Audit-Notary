#!/usr/bin/env node
/**
 * The lint against literal text in markup (AUN-WEB-7) and against raw controls in views (the closed
 * vocabulary of pm-web-app components.adoc). Run by `npm run lint`.
 *
 * - Outside `src/lib/i18n`, no `.svelte` file may hold a text node or one of the attributes `title`,
 *   `placeholder`, `aria-label`, `alt`, `label` with literal words; every text comes from the catalogue.
 * - In `src/lib/views`, `src/lib/templates` and `src/routes`, no raw `<button>`, `<a>`, `<input>`,
 *   `<select>` or `<textarea>`: views use the components.
 *
 * `--self-test` checks the rules against inline samples.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TEXT_ATTRIBUTES = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label']);
const RAW_CONTROLS = new Set(['button', 'a', 'input', 'select', 'textarea']);
const VOCABULARY_DIRS = ['lib/views', 'lib/templates', 'routes'];
const WORD = /\p{L}{2,}/u;

/**
 * @param {string} source the component source
 * @param {{ vocabulary: boolean }} rules which rules apply
 * @returns {string[]} the findings
 */
export function lintSource(source, rules) {
  const ast = parse(source, { modern: true });
  const findings = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    switch (node.type) {
      case 'Text':
        if (WORD.test(node.data)) findings.push(`literal text "${node.data.trim()}"`);
        return;
      case 'Attribute':
        if (TEXT_ATTRIBUTES.has(node.name) && Array.isArray(node.value)) {
          for (const part of node.value) {
            if (part.type === 'Text' && WORD.test(part.data)) {
              findings.push(`literal ${node.name}="${part.data.trim()}"`);
            }
          }
        }
        return;
      case 'ExpressionTag':
      case 'Comment':
        return;
      case 'RegularElement':
        if (rules.vocabulary && RAW_CONTROLS.has(node.name)) {
          findings.push(`raw <${node.name}> outside src/lib/components`);
        }
        break;
      default:
        break;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'type' && key !== 'start' && key !== 'end' && key !== 'metadata') visit(value);
    }
  };
  visit(ast.fragment);
  return findings;
}

function svelteFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return svelteFiles(full);
    return entry.name.endsWith('.svelte') ? [full] : [];
  });
}

function selfTest() {
  const cases = [
    ['<p>Hello</p>', { vocabulary: false }, 1],
    ['<p>{$t("x")}</p>', { vocabulary: false }, 0],
    ['<input placeholder="Type here" />', { vocabulary: false }, 1],
    ['<input placeholder={$t("x")} />', { vocabulary: false }, 0],
    ['<button>{$t("x")}</button>', { vocabulary: true }, 1],
    ['<Button>{$t("x")}</Button>', { vocabulary: true }, 0],
    ['<p>–</p>', { vocabulary: false }, 0],
  ];
  for (const [source, rules, expected] of cases) {
    const found = lintSource(source, rules).length;
    if (found !== expected) {
      console.error(`self-test failed for ${source}: ${found} finding(s), expected ${expected}`);
      process.exit(1);
    }
  }
  console.info('text-literal-lint: self-test passed');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  let total = 0;
  for (const file of svelteFiles(SRC)) {
    const relative = path.relative(SRC, file).split(path.sep).join('/');
    if (relative.startsWith('lib/i18n/')) continue;
    const vocabulary = VOCABULARY_DIRS.some((dir) => relative.startsWith(`${dir}/`));
    for (const finding of lintSource(fs.readFileSync(file, 'utf8'), { vocabulary })) {
      console.error(`${relative}: ${finding}`);
      total += 1;
    }
  }
  if (total > 0) {
    console.error(`text-literal-lint: ${total} finding(s)`);
    process.exit(1);
  }
  console.info('text-literal-lint: no literal text in markup');
}
