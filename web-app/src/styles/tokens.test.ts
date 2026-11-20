import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LAYER_TOKENS } from './layers';
import { contrastRatio } from '../test/colourMetrics';

/**
 * The token contract of `tokens.css` (TRH-WEB-2).
 *
 * The file is read as text: a token that is renamed or dropped fails here instead of falling back
 * silently in the browser. Every text/background pair the views render is audited for WCAG 2.1 AA in
 * both themes: 4.5:1 for text, 3:1 for state colours and graphics (success criteria 1.4.3 and 1.4.11).
 */

const TOKENS_PATH = path.resolve(__dirname, 'tokens.css');
const SRC = path.resolve(__dirname, '..');
const css = fs.readFileSync(TOKENS_PATH, 'utf8');

/** Reads the declarations of the first block that starts with the given selector line. */
function block(selectorLine: string): Record<string, string> {
  const start = css.indexOf(selectorLine);
  expect(start, `block ${selectorLine}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(start, end);
  const declarations: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    declarations[match[1]] = match[2].trim();
  }
  return declarations;
}

const rootBlock = block(':root {');
const darkMedia = block('@media (prefers-color-scheme: dark)');
const lightTheme = block("[data-theme='light'] {");
const darkTheme = block("[data-theme='dark'] {");

const colourKeys = (declarations: Record<string, string>): string[] =>
  Object.keys(declarations)
    .filter((key) => key.startsWith('--color-') && !key.startsWith('--color-mascot-'))
    .sort();

const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

/** The text colours and the surfaces they stand on. */
const TEXT_TOKENS = ['--color-text-primary', '--color-text-secondary', '--color-text-muted'];
const SURFACES = [
  '--color-bg-app',
  '--color-bg-rail',
  '--color-bg-surface',
  '--color-bg-raised',
  '--color-bg-subtle',
];
/** Colours used as text or as a link on the surfaces (brand links, state words). */
const STATE_TEXT = [
  '--color-brand',
  '--color-attention-text',
  '--color-danger',
  '--color-success',
  '--color-running',
  '--color-kind-samm',
  '--color-kind-threat-model',
  '--color-kind-incident',
  '--color-kind-isms',
];

describe('tokens.css', () => {
  it('declares the same colour tokens in every theme block', () => {
    const expected = colourKeys(rootBlock);
    expect(colourKeys(darkMedia)).toEqual(expected);
    expect(colourKeys(lightTheme)).toEqual(expected);
    expect(colourKeys(darkTheme)).toEqual(expected);
  });

  it('keeps the light default and the light theme identical, and both dark blocks identical', () => {
    for (const key of colourKeys(rootBlock)) {
      expect(lightTheme[key], key).toBe(rootBlock[key]);
      expect(darkTheme[key], key).toBe(darkMedia[key]);
    }
  });

  it('declares the mascot palette once, identical in both themes', () => {
    expect(rootBlock['--color-mascot-fur']).toBe('#e17512');
    expect(rootBlock['--color-mascot-gold']).toBe('#f2b630');
    expect(rootBlock['--color-mascot-hat']).toBe('#a0602e');
    expect(rootBlock['--color-mascot-cream']).toBe('#f6ddb0');
    expect(rootBlock['--color-mascot-outline']).toBe('#2a1a10');
    expect(darkTheme['--color-mascot-fur']).toBeUndefined();
  });

  it('declares the layers of layers.ts', () => {
    for (const layer of LAYER_TOKENS) {
      expect(rootBlock[layer.token], layer.token).toBe(String(layer.value));
    }
  });

  for (const [theme, palette] of Object.entries(themes)) {
    describe(`${theme} theme`, () => {
      for (const text of [...TEXT_TOKENS, ...STATE_TEXT]) {
        for (const surface of SURFACES) {
          it(`${text} on ${surface} reaches 4.5:1`, () => {
            expect(contrastRatio(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
          });
        }
      }

      it('ink on the brand fill reaches 4.5:1', () => {
        expect(
          contrastRatio(palette['--color-on-brand'], palette['--color-brand']),
        ).toBeGreaterThanOrEqual(4.5);
      });

      for (const state of ['--color-attention', '--color-neutral']) {
        it(`${state} as a graphic on the surface reaches 3:1`, () => {
          expect(
            contrastRatio(palette[state], palette['--color-bg-surface']),
          ).toBeGreaterThanOrEqual(3);
        });
      }
    });
  }
});

/** Every source file below src/ other than tokens.css and the tests. */
function sourceFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'test' && entry.name !== 'main') result.push(...sourceFiles(full));
    } else if (/\.(svelte|css|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      result.push(full);
    }
  }
  return result;
}

describe('colour literals', () => {
  const files = sourceFiles(SRC).filter((file) => file !== TOKENS_PATH);
  const declared = new Set(Object.keys(rootBlock));

  it('appear in no view or component (TRH-WEB-2)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (/#[0-9a-fA-F]{3,8}\b(?![-\w])|\b(?:rgb|rgba|hsl|hsla|oklch)\(/.test(text)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every var(--token) a source uses is declared in tokens.css or is component-local', () => {
    const undeclared = new Set<string>();
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      // Component-local properties: declared in the file's CSS, or bound through a `style:--name` directive.
      const local = new Set(
        [...text.matchAll(/(?:style:)?(--[a-z0-9-]+)\s*[:=]/g)].map((match) => match[1]),
      );
      for (const match of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!declared.has(match[1]) && !local.has(match[1])) {
          undeclared.add(`${path.relative(SRC, file)}: ${match[1]}`);
        }
      }
    }
    expect([...undeclared]).toEqual([]);
  });
});
