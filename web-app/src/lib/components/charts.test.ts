import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Dumbbell, { type DumbbellRow } from './Dumbbell.svelte';
import SeriesChart, { type Series } from './SeriesChart.svelte';

/**
 * The two charts of the lens Reports: several lines on one scale, and the dumbbell of two moments (AUN-WEB-2: the chart
 * names its series, carries every value as text and never depends on a colour alone).
 */
const line = (id: string, slot: number, values: [number, number][]): Series => ({
  id,
  label: `Series ${id}`,
  slot,
  points: values.map(([x, value]) => ({ x, value, text: String(value) })),
});

describe('SeriesChart', () => {
  const series = [
    line('a', 1, [
      [0, 1],
      [1, 2],
    ]),
    line('b', 2, [
      [0, 1.1],
      [1, 1.2],
    ]),
  ];
  const ticks = [
    { x: 0, label: 'First' },
    { x: 1, label: 'Second' },
  ];

  it('names the chart and lists every series in a legend', () => {
    render(SeriesChart, {
      series,
      ticks,
      domain: [0, 1],
      max: 3,
      label: 'Scores of two series',
      legendLabel: 'Series',
      testId: 'chart',
    });
    expect(screen.getByRole('img', { name: 'Scores of two series' })).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Series' });
    expect(legend).toHaveTextContent('Series a');
    expect(legend).toHaveTextContent('Series b');
  });

  it('draws a line for a series of several points and writes its last value', () => {
    const { container } = render(SeriesChart, {
      series,
      ticks,
      domain: [0, 1],
      max: 3,
      label: 'Chart',
      legendLabel: 'Series',
    });
    expect(container.querySelectorAll('.chart__line')).toHaveLength(2);
    const values = [...container.querySelectorAll('.chart__value')].map((node) => node.textContent);
    expect(values).toEqual(['2', '1.2']);
  });

  it('keeps the end labels of two lines that finish together apart', () => {
    const { container } = render(SeriesChart, {
      series: [line('a', 1, [[0, 1.5]]), line('b', 2, [[0, 1.5]])],
      ticks: [{ x: 0, label: 'Only' }],
      domain: [0, 0],
      max: 3,
      label: 'Chart',
      legendLabel: 'Series',
    });
    const ys = [...container.querySelectorAll('.chart__value')].map((node) =>
      Number(node.getAttribute('y')),
    );
    expect(ys).toHaveLength(2);
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(13);
    // A single point has no line, only its marker.
    expect(container.querySelectorAll('.chart__line')).toHaveLength(0);
  });

  it('ties a label that was moved off its line end to it, and no other', () => {
    const { container } = render(SeriesChart, {
      series: [line('a', 1, [[0, 1.5]]), line('b', 2, [[0, 1.5]]), line('c', 3, [[0, 0.2]])],
      ticks: [{ x: 0, label: 'Only' }],
      domain: [0, 0],
      max: 3,
      label: 'Chart',
      legendLabel: 'Series',
    });
    // The first label stays where its line ends; the second is moved down and carries a leader.
    expect(container.querySelector('[data-series="a"] .chart__leader')).toBeNull();
    expect(container.querySelector('[data-series="b"] .chart__leader')).not.toBeNull();
    expect(container.querySelector('[data-series="c"] .chart__leader')).toBeNull();
  });

  it('keeps the labels of lines that end at the bottom inside the figure', () => {
    const { container } = render(SeriesChart, {
      series: [1, 2, 3, 4, 5].map((slot) => line(`s${slot}`, slot, [[0, 0]])),
      ticks: [{ x: 0, label: 'Only' }],
      domain: [0, 0],
      max: 3,
      label: 'Chart',
      legendLabel: 'Series',
    });
    const ys = [...container.querySelectorAll('.chart__value')].map((node) =>
      Number(node.getAttribute('y')),
    );
    expect(Math.max(...ys)).toBeLessThanOrEqual(192);
    expect(new Set(ys).size).toBe(5);
  });

  it('gives each of the five slots its own shape beside the colour', () => {
    const { container } = render(SeriesChart, {
      series: [1, 2, 3, 4, 5].map((slot) => line(`s${slot}`, slot, [[0, slot - 0.5]])),
      ticks: [{ x: 0, label: 'Only' }],
      domain: [0, 0],
      max: 3,
      label: 'Chart',
      legendLabel: 'Series',
    });
    const marks = container.querySelectorAll('svg.chart__figure g[data-series] .chart__mark > *');
    const shapes = [...marks].map((node) => node.tagName.toLowerCase());
    expect(shapes).toEqual(['circle', 'rect', 'path', 'path', 'path']);
    expect(marks[4]).toHaveClass('mark-cross');
    expect(container.querySelector('.series--5')).not.toBeNull();
  });

  it('draws nothing for a series without a point and no value label', () => {
    const { container } = render(SeriesChart, {
      series: [line('empty', 1, [])],
      ticks: [],
      domain: [0, 1],
      max: 3,
      label: 'Chart',
      legendLabel: 'Series',
    });
    expect(container.querySelectorAll('.chart__value')).toHaveLength(0);
  });

  it('uses a 0 to 1 scale for a top that is not positive', () => {
    const { container } = render(SeriesChart, {
      series,
      ticks,
      domain: [0, 1],
      max: 0,
      label: 'Chart',
      legendLabel: 'Series',
    });
    expect(container.querySelectorAll('.chart__grid')).toHaveLength(2);
  });
});

describe('Dumbbell', () => {
  const rows: DumbbellRow[] = [
    {
      id: 'overall',
      label: 'Overall score',
      from: 1,
      to: 1.5,
      values: '1 to 1.5',
      change: '+0.5',
    },
    {
      id: 'sm',
      label: 'Strategy and Metrics',
      from: 2,
      to: 1,
      values: '2 to 1',
      change: '-1',
      slot: 2,
      level: 1,
    },
  ];

  it('says every row in words: its name, its two scores and the change', () => {
    render(Dumbbell, {
      rows,
      max: 3,
      fromLabel: 'Earlier',
      toLabel: 'Later',
      label: 'Scores',
      testId: 'bell',
    });
    const list = screen.getByRole('list', { name: 'Scores' });
    expect(list).toHaveTextContent('Overall score');
    expect(list).toHaveTextContent('1 to 1.5');
    expect(list).toHaveTextContent('+0.5');
    expect(screen.getByTestId('dumbbell-sm')).toHaveTextContent('-1');
  });

  it('places the dots on the scale and the bar between them, whichever comes first', () => {
    render(Dumbbell, { rows, max: 3, fromLabel: 'Earlier', toLabel: 'Later', label: 'Scores' });
    const track = screen
      .getByTestId('dumbbell-sm')
      .querySelector('.dumbbell__track') as HTMLElement;
    expect(track.style.getPropertyValue('--from')).toBe('66.66666666666666');
    expect(track.style.getPropertyValue('--to')).toBe('33.33333333333333');
    expect(track.style.getPropertyValue('--lo')).toBe('33.33333333333333');
    expect(track.style.getPropertyValue('--hi')).toBe('66.66666666666666');
    expect(screen.getByTestId('dumbbell-sm')).toHaveClass('series--2', 'dumbbell__row--1');
    expect(screen.getByTestId('dumbbell-overall')).toHaveClass('series--0');
  });

  it('keeps a score off the scale at its edge', () => {
    render(Dumbbell, {
      rows: [{ id: 'x', label: 'X', from: -1, to: 9, values: '', change: '' }],
      max: 3,
      fromLabel: 'Earlier',
      toLabel: 'Later',
      label: 'Scores',
    });
    const track = screen.getByTestId('dumbbell-x').querySelector('.dumbbell__track') as HTMLElement;
    expect(track.style.getPropertyValue('--from')).toBe('0');
    expect(track.style.getPropertyValue('--to')).toBe('100');
  });

  it('names the ring and the dot in a legend, which a list inside another may leave out', () => {
    const { rerender } = render(Dumbbell, {
      rows,
      max: 3,
      fromLabel: 'Earlier',
      toLabel: 'Later',
      label: 'Scores',
    });
    expect(screen.getByText('Earlier')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
    rerender({
      rows,
      max: 3,
      fromLabel: 'Earlier',
      toLabel: 'Later',
      label: 'Scores',
      legend: false,
    });
  });

  it('draws a scale from 0 to the top', () => {
    const { container } = render(Dumbbell, {
      rows,
      max: 3,
      fromLabel: 'Earlier',
      toLabel: 'Later',
      label: 'Scores',
    });
    expect(
      [...container.querySelectorAll('.dumbbell__tick')].map((node) => node.textContent),
    ).toEqual(['0', '1', '2', '3']);
  });
});
