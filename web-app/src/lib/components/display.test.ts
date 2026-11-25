import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { textSnippet } from '../test/snippets';
import Avatar from './Avatar.svelte';
import Chip from './Chip.svelte';
import ColumnHead from './ColumnHead.svelte';
import Disclosure from './Disclosure.svelte';
import GapStrip from './GapStrip.svelte';
import HistoryList from './HistoryList.svelte';
import KindMark, { KIND_ICONS, type Kind } from './KindMark.svelte';
import MaturitySeal, {
  arcPath,
  GEOMETRY,
  layout,
  lobePath,
  radiusOf,
  sealPath,
  type SealFunction,
} from './MaturitySeal.svelte';
import ReasonBadge from './ReasonBadge.svelte';
import RowLink from './RowLink.svelte';
import SaveState, { type SaveStateKind } from './SaveState.svelte';
import ScoreMeter from './ScoreMeter.svelte';
import Sheet from './Sheet.svelte';
import SheetHead from './SheetHead.svelte';
import StatusLabel from './StatusLabel.svelte';
import TrendLine from './TrendLine.svelte';

describe('Avatar', () => {
  it('shows the initials and hides them from assistive technology beside a name', () => {
    const { container } = render(Avatar, { name: 'Alex Example', size: 'sm' });
    const avatar = container.querySelector('.avatar') as HTMLElement;
    expect(avatar).toHaveTextContent('AE');
    expect(avatar).toHaveClass('avatar--sm');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
  });

  it('stands for the name when labelled', () => {
    render(Avatar, { name: 'Noor Haddad', labelled: true });
    expect(screen.getByRole('img', { name: 'Noor Haddad' })).toHaveAttribute(
      'title',
      'Noor Haddad',
    );
  });
});

describe('Chip', () => {
  it('shows the identifier with its name', () => {
    render(Chip, { value: 'p-4c1a9e', label: 'Pseudonym', testId: 'chip' });
    expect(screen.getByTestId('chip')).toHaveTextContent('p-4c1a9e');
    expect(screen.getByLabelText('Pseudonym')).toBeInTheDocument();
  });
});

describe('ColumnHead', () => {
  it('links the title and shows the meta line', () => {
    const { container } = render(ColumnHead, {
      kind: 'scope',
      kindLabel: 'Scope',
      title: 'Payments',
      href: '/samm/payments',
      meta: textSnippet('4 assessments'),
    });
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute(
      'href',
      '/samm/payments',
    );
    expect(container.querySelector('.column-head__meta')).toHaveTextContent('4 assessments');
  });

  it('leaves out the meta line without one', () => {
    const { container } = render(ColumnHead, {
      kind: 'samm',
      kindLabel: 'SAMM',
      title: 'Scopes',
      href: '/samm',
    });
    expect(container.querySelector('.column-head__meta')).toBeNull();
  });
});

describe('Disclosure', () => {
  it('folds the content behind the summary, open on request', () => {
    const { container } = render(Disclosure, {
      summary: textSnippet('Quality criteria'),
      open: true,
      testId: 'criteria',
      children: textSnippet('Every release is reviewed.'),
    });
    expect(screen.getByTestId('criteria')).toHaveAttribute('open');
    expect(container.querySelector('summary')).toHaveTextContent('Quality criteria');
    expect(screen.getByText('Every release is reviewed.')).toBeInTheDocument();
  });

  it('starts closed', () => {
    render(Disclosure, {
      summary: textSnippet('More'),
      testId: 'more',
      children: textSnippet('Text'),
    });
    expect(screen.getByTestId('more')).not.toHaveAttribute('open');
  });
});

describe('GapStrip', () => {
  const levels = [
    { key: 'samm', kind: 'samm' as Kind, kindLabel: 'SAMM', title: 'Scopes' },
    { key: 'payments', kind: 'scope' as Kind, kindLabel: 'Scope', title: 'Payments' },
  ];

  it('peeks at a hidden level, with names', async () => {
    const onselect = vi.fn();
    render(GapStrip, { side: 'left', levels, names: true, label: 'Hidden levels', onselect });
    expect(screen.getByRole('navigation', { name: 'Hidden levels' })).toBeInTheDocument();
    const item = screen.getByTestId('strip-payments');
    expect(item).not.toHaveAttribute('title');
    expect(item.querySelector('.strip__name')).toHaveTextContent('Payments');
    await fireEvent.click(item);
    expect(onselect).toHaveBeenCalledWith(1);
  });

  it('titles the marks without names', () => {
    render(GapStrip, { side: 'left', levels, label: 'Hidden levels', onselect: () => {} });
    const item = screen.getByTestId('strip-samm');
    expect(item).toHaveAttribute('title', 'SAMM: Scopes');
    expect(item.querySelector('.sr-only')).toHaveTextContent('Scopes');
  });

  it('returns to the object from the right', async () => {
    const onselect = vi.fn();
    render(GapStrip, { side: 'right', levels, label: 'Back to the object', onselect });
    const back = screen.getByTestId('strip-return');
    expect(back).toHaveTextContent('Back to the object');
    expect(back.querySelectorAll('.kind')).toHaveLength(2);
    await fireEvent.click(back);
    expect(onselect).toHaveBeenCalledWith(null);
  });
});

describe('HistoryList', () => {
  it('names who did what and when, and seals a release', () => {
    const { container } = render(HistoryList, {
      label: 'History',
      testId: 'history',
      entries: [
        {
          key: 'b',
          who: 'Noor Haddad',
          what: 'Released v1',
          when: '25 Nov',
          datetime: '2026-11-25T10:00:00Z',
          release: true,
        },
        {
          key: 'a',
          who: 'Alex Example',
          what: 'Saved',
          when: '24 Nov',
          datetime: '2026-11-24T09:00:00Z',
        },
      ],
    });
    expect(screen.getByRole('list', { name: 'History' })).toBe(screen.getByTestId('history'));
    const lines = container.querySelectorAll('.history__line');
    expect(lines[0]).toHaveClass('history__line--release');
    expect(lines[1]).not.toHaveClass('history__line--release');
    expect(lines[1].querySelector('time')).toHaveAttribute('datetime', '2026-11-24T09:00:00Z');
    expect(lines[1]).toHaveTextContent('Alex Example Saved 24 Nov');
  });
});

describe('KindMark', () => {
  it.each(Object.keys(KIND_ICONS) as Kind[])('marks %s with its icon and tint', (kind) => {
    const { container } = render(KindMark, { kind, label: 'Word' });
    expect(container.querySelector(`[data-icon="${KIND_ICONS[kind]}"]`)).not.toBeNull();
    expect(container.querySelector('.kind__icon')?.className).toMatch(/kind__icon--[a-z-]+/);
    expect(screen.getByText('Word')).toBeInTheDocument();
  });

  it('keeps a neutral kind untinted and names an icon-only mark', () => {
    const { container } = render(KindMark, { kind: 'catalog', label: 'Catalogue', iconOnly: true });
    expect(container.querySelector('.kind__icon')).toHaveClass('kind__icon--neutral');
    expect(container.querySelector('.kind__word')).toBeNull();
    expect(screen.getByRole('img', { name: 'Catalogue' })).toBeInTheDocument();
  });
});

describe('ReasonBadge', () => {
  it('is attention by default and danger on request', () => {
    render(ReasonBadge, { label: 'Conflict', testId: 'calm' });
    render(ReasonBadge, { label: '3 days overdue', tone: 'danger', testId: 'late' });
    expect(screen.getByTestId('calm')).toHaveAttribute('data-tone', 'attention');
    expect(screen.getByTestId('late')).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByTestId('late')).toHaveTextContent('3 days overdue');
  });
});

describe('RowLink', () => {
  it('marks the selected row as current', () => {
    render(RowLink, {
      href: '/samm/payments',
      selected: true,
      label: 'Payments',
      testId: 'row',
      children: textSnippet('Payments row'),
    });
    const row = screen.getByRole('link', { name: 'Payments' });
    expect(row).toHaveAttribute('aria-current', 'page');
    expect(row).toHaveClass('row--selected');
  });

  it('leaves other rows plain', () => {
    render(RowLink, { href: '/samm/shop', children: textSnippet('Shop') });
    expect(screen.getByRole('link', { name: 'Shop' })).not.toHaveAttribute('aria-current');
  });
});

describe('SaveState', () => {
  it.each<[SaveStateKind, string]>([
    ['clean', 'state.check'],
    ['changed', 'state.draft'],
    ['drafting', 'state.draft'],
    ['draft', 'state.person'],
    ['saving', 'act.save'],
    ['saved', 'state.done'],
    ['conflict', 'state.conflict'],
    ['failed', 'state.alert'],
    ['read-only', 'state.lock'],
  ])('shows %s with its icon', (state, icon) => {
    const { container } = render(SaveState, { state, label: 'Sentence', testId: 'save' });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-state', state);
    expect(status).toHaveTextContent('Sentence');
    expect(container.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
  });
});

describe('ScoreMeter', () => {
  it('fills to the score and ticks the target', () => {
    const { container } = render(ScoreMeter, {
      props: { value: 1.5, target: 2, text: '1.5', label: '1.5 of 3, target 2', tone: 'attention' },
    });
    const meter = screen.getByRole('img', { name: '1.5 of 3, target 2' });
    expect(meter).toHaveClass('meter--attention');
    expect(
      (container.querySelector('.meter__fill') as HTMLElement).style.getPropertyValue(
        '--meter-fill',
      ),
    ).toBe('50%');
    expect(
      (container.querySelector('.meter__target') as HTMLElement).style.getPropertyValue(
        '--meter-target',
      ),
    ).toBe(`${(2 / 3) * 100}%`);
    expect(meter).toHaveTextContent('1.5');
  });

  it('clamps the score and draws no target without one', () => {
    const { container } = render(ScoreMeter, { value: 5, text: '5', label: 'Score' });
    expect(container.querySelector('.meter')).toHaveClass('meter--ink');
    expect(
      (container.querySelector('.meter__fill') as HTMLElement).style.getPropertyValue(
        '--meter-fill',
      ),
    ).toBe('100%');
    expect(container.querySelector('.meter__target')).toBeNull();
  });
});

describe('Sheet', () => {
  it('puts the status in a band and the margin at the foot while narrow', () => {
    const { container } = render(Sheet, {
      children: textSnippet('Record'),
      margin: textSnippet('History'),
      status: textSnippet('Saved'),
      marginLabel: 'Register',
      testId: 'sheet',
    });
    expect(container.querySelector('.sheet__band')).toHaveTextContent('Saved');
    expect(container.querySelector('.sheet__foot')).toHaveTextContent('History');
    expect(container.querySelector('.sheet__margin')).toBeNull();
    expect(container.querySelector('.sheet')).not.toHaveClass('sheet--narrow');
  });

  it('marks a narrow sheet', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    const { container } = render(Sheet, { children: textSnippet('Record') });
    expect(container.querySelector('.sheet')).toHaveClass('sheet--narrow');
    expect(container.querySelector('aside')).toBeNull();
  });

  it('stands the margin beside the record when wide', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    const { container } = render(Sheet, {
      children: textSnippet('Record'),
      margin: textSnippet('History'),
      status: textSnippet('Saved'),
      marginLabel: 'Register',
    });
    expect(container.querySelector('.sheet')).toHaveClass('sheet--wide');
    expect(container.querySelector('.sheet__band')).toBeNull();
    const margin = screen.getByRole('complementary', { name: 'Register' });
    expect(margin.querySelector('.sheet__status')).toHaveTextContent('Saved');
    expect(margin).toHaveTextContent('History');
  });

  it('shows only the status in a wide margin without one', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    const { container } = render(Sheet, {
      children: textSnippet('Record'),
      status: textSnippet('Saved'),
    });
    expect(container.querySelector('.sheet__margin')).toHaveTextContent('Saved');
  });

  it('shows only the margin when wide without a status', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    const { container } = render(Sheet, {
      children: textSnippet('Record'),
      margin: textSnippet('History'),
    });
    expect(container.querySelector('.sheet__status')).toBeNull();
    expect(container.querySelector('.sheet__margin')).toHaveTextContent('History');
  });
});

describe('SheetHead', () => {
  it('shows kind, state, title, lede, acts and facts', () => {
    const { container } = render(SheetHead, {
      kind: 'assessment',
      kindLabel: 'Assessment',
      title: 'Payments 2026 Q4',
      lede: 'The fourth quarter.',
      state: textSnippet('Draft'),
      actions: textSnippet('Submit'),
      facts: [
        { term: 'Scope', value: 'Payments' },
        { term: 'Model', value: 'v2.2.0' },
      ],
      size: 'title',
    });
    expect(container.querySelector('header')).toHaveClass('sheet-head--title');
    expect(screen.getByRole('heading', { level: 1, name: 'Payments 2026 Q4' })).toBeInTheDocument();
    expect(screen.getByText('The fourth quarter.')).toBeInTheDocument();
    expect(container.querySelector('.sheet-head__line')).toHaveTextContent('Assessment Draft');
    expect(container.querySelector('.sheet-head__actions')).toHaveTextContent('Submit');
    expect(container.querySelectorAll('.sheet-head__fact')).toHaveLength(2);
  });

  it('leaves out what it is not given', () => {
    const { container } = render(SheetHead, { kind: 'scope', kindLabel: 'Scope', title: 'Shop' });
    expect(container.querySelector('header')).toHaveClass('sheet-head--display');
    expect(container.querySelector('.sheet-head__lede')).toBeNull();
    expect(container.querySelector('.sheet-head__actions')).toBeNull();
    expect(container.querySelector('dl')).toBeNull();
  });
});

describe('StatusLabel', () => {
  it('is neutral by default and carries its tone', () => {
    render(StatusLabel, { label: 'Draft', testId: 'plain' });
    render(StatusLabel, { label: 'Released', tone: 'sealed', testId: 'sealed' });
    expect(screen.getByTestId('plain')).toHaveAttribute('data-tone', 'neutral');
    expect(screen.getByTestId('sealed')).toHaveClass('status--sealed');
    expect(screen.getByTestId('sealed')).toHaveTextContent('Released');
  });
});

describe('TrendLine', () => {
  const points = [
    { label: '2025 Q4', value: 1, text: '1.00' },
    { label: '2026 Q2', value: 1.5, text: '1.50' },
    { label: '2026 Q4', value: 2, text: '2.00' },
  ];

  it('draws the line, the grid and the last value, and tabulates every point', () => {
    const { container } = render(TrendLine, { points, max: 3, label: 'Overall score' });
    expect(screen.getByRole('img', { name: 'Overall score' })).toBeInTheDocument();
    expect(container.querySelectorAll('.trend__grid')).toHaveLength(4);
    expect(container.querySelector('.trend__line')?.getAttribute('d')).toMatch(
      /^M28 \S+ L\S+ \S+ L504 /,
    );
    expect(
      [...container.querySelectorAll('.trend__value')].map((text) => text.textContent),
    ).toEqual(['2.00']);
    expect(container.querySelector('table caption')).toHaveTextContent('Overall score');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('states a point under the pointer', async () => {
    const { container } = render(TrendLine, { points, max: 3, label: 'Overall score' });
    const first = container.querySelectorAll('.trend__point')[0];
    await fireEvent.mouseEnter(first);
    expect(first).toHaveClass('trend__point--active');
    expect(first.querySelector('.trend__value')).toHaveTextContent('1.00');
    await fireEvent.mouseLeave(first);
    expect(first.querySelector('.trend__value')).toBeNull();
  });

  it('places a single point at the left edge', () => {
    const { container } = render(TrendLine, { points: [points[0]], max: 3, label: 'One' });
    expect(container.querySelector('.trend__line')?.getAttribute('d')).toMatch(/^M28 /);
  });
});

describe('MaturitySeal geometry', () => {
  it('maps the 0 to 3 scale between hub and edge, clamped', () => {
    expect(radiusOf(0)).toBe(GEOMETRY.hub);
    expect(radiusOf(3)).toBe(GEOMETRY.max);
    expect(radiusOf(-1)).toBe(GEOMETRY.hub);
    expect(radiusOf(9)).toBe(GEOMETRY.max);
  });

  it('draws a lobe only beyond the hub', () => {
    expect(lobePath(0, 10, GEOMETRY.hub)).toBe('');
    const lobe = lobePath(0, 10, 120);
    expect(lobe.startsWith('M')).toBe(true);
    expect(lobe).toContain(' Q');
    expect(lobe.endsWith('Z')).toBe(true);
  });

  it('draws arcs and the scalloped ring', () => {
    expect(arcPath(100, 0, 90)).toBe('M100.00 0.00 A100 100 0 0 1 0.00 100.00');
    const ring = sealPath(200, 214, 4);
    expect(ring.match(/Q/g)).toHaveLength(4);
    expect(ring.endsWith(' Z')).toBe(true);
  });

  it('lays out two lobes per practice with gaps between functions', () => {
    const cells = layout([{ practices: [1, 2] }, { practices: [3] }]);
    expect(cells.map((cell) => [cell.fn, cell.practice])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    const start = -90 + GEOMETRY.functionGap / 2;
    expect(cells[0].streams[0]).toEqual([start, start + GEOMETRY.lobe]);
    const afterPractice = cells[0].streams[1][1] + GEOMETRY.practiceGap;
    expect(cells[1].streams[0][0]).toBeCloseTo(afterPractice);
    expect(cells[2].streams[0][0]).toBeCloseTo(cells[1].streams[1][1] + GEOMETRY.functionGap);
    expect(cells[0].middle).toBeCloseTo((cells[0].streams[0][0] + cells[0].streams[1][1]) / 2);
  });
});

describe('MaturitySeal', () => {
  const functions: SealFunction[] = [
    {
      id: 'governance',
      name: 'Governance',
      scoreText: '1.50',
      practices: [
        {
          id: 'sm',
          shortName: 'SM',
          name: 'Strategy and Metrics',
          streams: [2, 1],
          score: 1.5,
          target: 2,
          href: '/samm/payments/payments-2026-q4/sm',
          label: 'Strategy and Metrics, 1.5 of 3, target 2',
        },
        {
          id: 'pc',
          shortName: 'PC',
          name: 'Policy and Compliance',
          streams: [0, 0],
          score: 0,
          target: null,
          href: null,
          label: 'Policy and Compliance, 0 of 3',
        },
      ],
    },
  ];

  function renderSeal(sealed: string | null = null) {
    return render(MaturitySeal, {
      functions,
      overallText: '0.75',
      overallLabel: 'Overall',
      scaleLabel: 'of 3',
      label: 'Maturity',
      legendLabel: 'Business functions',
      sealed,
      pressing: sealed !== null,
      format: (value: number) => value.toFixed(2),
      testId: 'seal',
    });
  }

  it('links the practices, names the rest and states the overall score', () => {
    const { container } = renderSeal();
    expect(screen.getByRole('group', { name: 'Maturity' })).toBeInTheDocument();
    expect(container.querySelector('a[data-practice="sm"]')).toHaveAttribute(
      'aria-label',
      'Strategy and Metrics, 1.5 of 3, target 2',
    );
    expect(screen.getByRole('img', { name: 'Policy and Compliance, 0 of 3' })).toBeInTheDocument();
    expect(container.querySelectorAll('.seal__target')).toHaveLength(1);
    expect(container.querySelector('.seal__hub')).toHaveTextContent('0.75of 3Overall');
    expect(screen.getByRole('list', { name: 'Business functions' })).toHaveTextContent(
      'Governance 1.50',
    );
    expect(screen.getByTestId('seal')).not.toHaveAttribute('data-sealed');
    expect(container.querySelector('.seal__impression')).toBeNull();
  });

  it('states the practice under the pointer or the focus in the hub', async () => {
    const { container } = renderSeal();
    const hub = container.querySelector('.seal__hub') as Element;
    const linked = container.querySelector('a[data-practice="sm"]') as Element;
    await fireEvent.focus(linked);
    expect(hub).toHaveTextContent('SM1.50');
    expect(linked).toHaveClass('seal__practice--active');
    await fireEvent.blur(linked);
    expect(hub).toHaveTextContent('0.75');
    await fireEvent.mouseEnter(linked);
    expect(hub).toHaveTextContent('SM');
    await fireEvent.mouseLeave(linked);
    const plain = container.querySelector('g[data-practice="pc"]') as Element;
    await fireEvent.mouseEnter(plain);
    expect(hub).toHaveTextContent('PC0.00');
    await fireEvent.mouseLeave(plain);
    expect(hub).toHaveTextContent('Overall');
  });

  it('rings a released assessment with the seal and its version', () => {
    const { container } = renderSeal('v1');
    const seal = screen.getByTestId('seal');
    expect(seal).toHaveAttribute('data-sealed', 'v1');
    expect(seal).toHaveClass('seal--sealed', 'seal--pressing');
    expect(container.querySelector('.seal__version-text')).toHaveTextContent('v1');
  });
});
