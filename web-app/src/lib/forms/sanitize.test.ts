import { describe, expect, it } from 'vitest';
import { safeHref, sanitizeHtml, type SafeNode } from './sanitize';
import { useProfile } from './testkit';

/** @returns the nodes as a compact string for comparison */
function show(nodes: SafeNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.text;
      const attrs = Object.entries(node.attrs)
        .map(([name, value]) => ` ${name}="${value}"`)
        .join('');
      return `<${node.tag}${attrs}>${show(node.children)}</${node.tag}>`;
    })
    .join('');
}

describe('the allow-list of the preview (AUN-WEB-4, AsciiDoc Preview)', () => {
  it('keeps what the allow-list names', () => {
    expect(
      show(
        sanitizeHtml(
          '<h2>Decision</h2><div><p>We <strong>agree</strong>, <em>see</em> <code>ops/keys</code></p></div><ul><li>a</li></ul>',
        ),
      ),
    ).toBe(
      '<h2>Decision</h2><div><p>We <strong>agree</strong>, <em>see</em> <code>ops/keys</code></p></div><ul><li>a</li></ul>',
    );
  });

  it('keeps the void elements empty and the attributes of tables and lists', () => {
    expect(show(sanitizeHtml('<p>a<br>b</p><hr><ol start="3"><li>x</li></ol>'))).toBe(
      '<p>a<br></br>b</p><hr></hr><ol start="3"><li>x</li></ol>',
    );
    expect(
      show(
        sanitizeHtml(
          '<table><tbody><tr><th scope="col" colspan="2" style="x">h</th><td rowspan="2" colspan="9999" scope="row">c</td></tr></tbody></table>',
        ),
      ),
    ).toBe(
      '<table><tbody><tr><th colspan="2" scope="col">h</th><td rowspan="2">c</td></tr></tbody></table>',
    );
    expect(show(sanitizeHtml('<ol start="x"><li>1</li></ol>'))).toBe('<ol><li>1</li></ol>');
  });

  it('drops script, style, iframe, form, svg and image with everything inside them', () => {
    const html =
      '<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="https://evil.invalid"></iframe>' +
      '<form action="x"><input name="y">text</form><svg><script>alert(2)</script></svg><img src="x" onerror="alert(3)">' +
      '<object data="x">o</object><template><p>t</p></template><!-- c --><p>b</p>';
    expect(show(sanitizeHtml(html))).toBe('<p>a</p><p>b</p>');
  });

  it('removes every attribute that is not named: class, id, style and the handlers', () => {
    expect(
      show(
        sanitizeHtml(
          '<h2 onclick="alert(1)" class="x" id="y" style="position:fixed" data-x="1">T</h2>' +
            '<div class="paragraph" style="a"><p onmouseover="b">x</p></div>',
        ),
      ),
    ).toBe('<h2>T</h2><div><p>x</p></div>');
  });

  it('keeps a link to https, http, mailto or a fragment, with rel and no target, and unwraps the rest', () => {
    const html =
      '<a href="https://example.org/doc" target="_blank" onclick="x">good</a> ' +
      '<a href="http://example.org">http</a> <a href="mailto:a@example.org">mail</a> <a href="#section">fragment</a> ' +
      '<a href="javascript:alert(1)">js</a> <a href="  JaVa\nScRiPt:alert(1)">js2</a> <a href="data:text/html,x">data</a> ' +
      '<a href="//evil.invalid">proto</a> <a href="relative/path">rel</a> <a>none</a> <a href="">empty</a>';
    expect(show(sanitizeHtml(html))).toBe(
      '<a href="https://example.org/doc" rel="noopener noreferrer">good</a> ' +
        '<a href="http://example.org" rel="noopener noreferrer">http</a> ' +
        '<a href="mailto:a@example.org" rel="noopener noreferrer">mail</a> ' +
        '<a href="#section" rel="noopener noreferrer">fragment</a> js js2 data proto rel none empty',
    );
  });

  it('replaces an element it does not know by its content', () => {
    expect(show(sanitizeHtml('<section><h1>Top</h1><font>in</font></section>'))).toBe('Topin');
  });

  it('cuts off what nests deeper than it draws, and answers nothing for nothing', () => {
    const deep = '<div>'.repeat(40) + 'x' + '</div>'.repeat(40);
    expect(show(sanitizeHtml(deep))).not.toContain('x');
    expect(sanitizeHtml('')).toEqual([]);
  });

  it('cuts down the hostile answer of the workshop profile to its harmless part', async () => {
    const kit = useProfile('workshop#preview-hostile');
    const answer = await kit.client.renderAsciiDoc('anything');
    const shown = show(sanitizeHtml(answer.html));
    expect(shown).toContain('<h2>Decision</h2>');
    expect(shown).toContain('<strong>bold</strong>');
    expect(shown).toContain(
      '<a href="https://example.org/doc" rel="noopener noreferrer">good link</a>',
    );
    expect(shown).toContain('<a href="#section" rel="noopener noreferrer">fragment</a>');
    expect(shown).toContain('<td colspan="2">cell</td>');
    for (const forbidden of [
      'script',
      'alert',
      'javascript',
      'data:',
      'iframe',
      'img',
      'form',
      'svg',
      'style',
      'onclick',
      'tracker',
    ]) {
      expect(shown, forbidden).not.toContain(forbidden);
    }
  });
});

describe('the address of a link', () => {
  it('strips what a browser ignores in a scheme before it reads the scheme', () => {
    expect(safeHref('https://example.org')).toBe('https://example.org');
    expect(safeHref('  https://exa mple.org ')).toBe('https://example.org');
    expect(safeHref('java\tscript:alert(1)')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref('#')).toBe('#');
  });
});
