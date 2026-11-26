/**
 * The preview of an `AsciiDocField` without `{@html}` (AUN-WEB-4, AsciiDoc Preview; AUN-WEB-8).
 *
 * The server renders in safe mode `secure` and sanitises against an allow-list; the web app does not trust that and
 * applies its own copy of the same list. It parses the answer with `DOMParser`, which runs no script and loads no
 * resource, and builds a tree of plain data from the nodes the list names: no other element, attribute or link survives.
 * The view draws the tree with its own elements ({@link SafeNode}), so no string is ever inserted as markup.
 */

/** A text of the preview. */
export interface SafeText {
  type: 'text';
  text: string;
}

/** An element of the preview, with the attributes the allow-list lets through. */
export interface SafeElement {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: SafeNode[];
}

/** A node of the preview. */
export type SafeNode = SafeText | SafeElement;

/** The elements that carry no attribute, except those named in {@link ATTRIBUTES}. */
const ELEMENTS = new Set([
  'p',
  'br',
  'hr',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'code',
  'pre',
  'sub',
  'sup',
  'blockquote',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'a',
]);

/** The elements without content, which the view draws without children. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set(['br', 'hr']);

/**
 * The elements dropped with everything inside them. Any other element the list does not name is replaced by its
 * content, so that a wrapper of the renderer costs no text.
 */
const DROPPED = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'svg',
  'math',
  'img',
  'picture',
  'audio',
  'video',
  'canvas',
  'link',
  'meta',
  'base',
  'title',
  'head',
  'template',
  'noscript',
  'noembed',
  'portal',
]);

/** The attributes an element may carry, with the check of each value. */
const ATTRIBUTES: Record<string, Record<string, (value: string) => boolean>> = {
  th: { colspan: isSpan, rowspan: isSpan, scope: isScope },
  td: { colspan: isSpan, rowspan: isSpan },
  ol: { start: (value) => /^-?\d{1,9}$/.test(value) },
};

/** The deepest nesting the preview draws: below it the content is dropped. */
const MAX_DEPTH = 32;

/** The schemes of a link the preview keeps. */
const SAFE_LINK = /^(https?:|mailto:)/i;

function isSpan(value: string): boolean {
  return /^[1-9]\d{0,2}$/.test(value);
}

function isScope(value: string): boolean {
  return ['row', 'col', 'rowgroup', 'colgroup'].includes(value);
}

/**
 * The address of a link, if the allow-list lets it through: the scheme `https`, `http` or `mailto`, or a fragment of
 * the same document. The white space and the control characters a browser ignores inside a scheme (`java\nscript:`)
 * are removed before the scheme is read, and the cleaned address is the one kept.
 *
 * @param href the value of `href`
 * @returns the address to link to, or `null` when the link must go
 */
export function safeHref(href: string): string | null {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what a browser strips from an address
  const cleaned = href.replace(/[\u0000- \u007f-\u009f]/g, '');
  if (cleaned === '') return null;
  if (cleaned.startsWith('#')) return cleaned;
  return SAFE_LINK.test(cleaned) ? cleaned : null;
}

function safeElement(element: Element, depth: number): SafeNode[] {
  const tag = element.tagName.toLowerCase();
  if (DROPPED.has(tag)) return [];
  const children = convert(element.childNodes, depth + 1);
  if (!ELEMENTS.has(tag)) return children;
  const attrs: Record<string, string> = {};
  if (tag === 'a') {
    const href = safeHref(element.getAttribute('href') ?? '');
    if (href === null) return children;
    attrs.href = href;
    attrs.rel = 'noopener noreferrer';
  } else {
    for (const [name, allowed] of Object.entries(ATTRIBUTES[tag] ?? {})) {
      const value = element.getAttribute(name);
      if (value !== null && allowed(value)) attrs[name] = value;
    }
  }
  return [{ type: 'element', tag, attrs, children: VOID_ELEMENTS.has(tag) ? [] : children }];
}

function convert(nodes: NodeListOf<ChildNode>, depth: number): SafeNode[] {
  if (depth > MAX_DEPTH) return [];
  const result: SafeNode[] = [];
  for (const node of Array.from(nodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) result.push({ type: 'text', text: node.textContent });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      result.push(...safeElement(node as Element, depth));
    }
  }
  return result;
}

/**
 * Cuts the server's HTML down to the allow-list.
 *
 * @param html the HTML the server sent
 * @returns the nodes the preview draws; every other node, attribute and link is gone
 */
export function sanitizeHtml(html: string): SafeNode[] {
  if (html === '') return [];
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return convert(parsed.body.childNodes, 0);
}
