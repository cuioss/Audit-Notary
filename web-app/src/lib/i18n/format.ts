/**
 * The message format of the catalogue: `{name}` parameters and the ICU subset `select` and `plural`
 * (`=0`, `one`, `other`, `#`). Taken over from `pm-web-app` (`src/lib/i18n/index.ts`).
 */

function skipWhitespace(text: string, startIndex: number): number {
  let i = startIndex;
  while (i < text.length && /\s/.test(text[i])) {
    i++;
  }
  return i;
}

function readBraceBlock(body: string, startIndex: number): { text: string; nextIndex: number } {
  let depth = 1;
  let i = startIndex;
  while (i < body.length && depth > 0) {
    if (body[i] === '{') {
      depth++;
    } else if (body[i] === '}') {
      depth--;
    }
    i++;
  }
  return { text: body.slice(startIndex, i - 1), nextIndex: i };
}

function parseSelectBranches(body: string): Record<string, string> {
  const branches: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    i = skipWhitespace(body, i);
    if (i >= body.length) break;

    const keyStart = i;
    if (body[i] === '=') {
      // An exact-count branch (`=0`, `=1`, …), as ICU plural messages allow.
      i++;
    }
    while (i < body.length && /[a-zA-Z0-9_-]/.test(body[i])) {
      i++;
    }
    const key = body.slice(keyStart, i);

    i = skipWhitespace(body, i);
    if (i >= body.length || body[i] !== '{') break;

    const block = readBraceBlock(body, i + 1);
    branches[key] = block.text;
    i = block.nextIndex;
  }
  return branches;
}

function resolveIcuSelect(result: string, params: Record<string, string | number>): string {
  const selectIdx = result.indexOf(', select,');
  if (selectIdx === -1) return result;

  const openBrace = result.lastIndexOf('{', selectIdx);
  if (openBrace === -1) return result;

  const varName = result.slice(openBrace + 1, selectIdx).trim();
  const val = String(params[varName] ?? '');

  let depth = 0;
  let closeBrace = -1;
  for (let i = openBrace; i < result.length; i++) {
    if (result[i] === '{') depth++;
    else if (result[i] === '}') {
      depth--;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }

  if (closeBrace === -1) return result;

  const body = result.slice(selectIdx + ', select,'.length, closeBrace);
  const branches = parseSelectBranches(body);
  const replacement = branches[val] ?? branches['other'] ?? '';
  return result.slice(0, openBrace) + replacement + result.slice(closeBrace + 1);
}

function resolveIcuPlural(result: string, params: Record<string, string | number>): string {
  const pluralIdx = result.indexOf(', plural,');
  if (pluralIdx === -1) return result;

  const openBrace = result.lastIndexOf('{', pluralIdx);
  if (openBrace === -1) return result;

  const varName = result.slice(openBrace + 1, pluralIdx).trim();
  const count = Number(params[varName] ?? 0);

  let depth = 0;
  let closeBrace = -1;
  for (let i = openBrace; i < result.length; i++) {
    if (result[i] === '{') depth++;
    else if (result[i] === '}') {
      depth--;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }

  if (closeBrace === -1) return result;

  const body = result.slice(pluralIdx + ', plural,'.length, closeBrace);
  const branches = parseSelectBranches(body);
  const exactKey = `=${count}`;
  let replacement = branches[exactKey];
  if (replacement === undefined) {
    if (count === 1 && branches['one'] !== undefined) {
      replacement = branches['one'];
    } else {
      replacement = branches['other'] ?? '';
    }
  }
  replacement = replacement.replaceAll('#', String(count));
  return result.slice(0, openBrace) + replacement + result.slice(closeBrace + 1);
}

/**
 * Fills a message template.
 *
 * @param template the catalogue text
 * @param params the parameters; without them the template is returned as it is
 * @returns the text with `select` and `plural` resolved and `{name}` replaced
 */
export function formatString(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  let processed = template;
  while (processed.includes(', select,')) {
    const next = resolveIcuSelect(processed, params);
    if (next === processed) break;
    processed = next;
  }
  while (processed.includes(', plural,')) {
    const next = resolveIcuPlural(processed, params);
    if (next === processed) break;
    processed = next;
  }
  return processed.replace(/\{(\w+)\}/g, (match, key) => {
    if (key in params) {
      return String(params[key]);
    }
    return match;
  });
}
