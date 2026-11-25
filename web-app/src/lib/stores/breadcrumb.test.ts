import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { breadcrumb } from './breadcrumb';

describe('breadcrumb', () => {
  it('starts empty and holds the path a view sets', () => {
    expect(get(breadcrumb)).toEqual([]);
    breadcrumb.set([{ label: 'Payments', href: '/samm/payments' }]);
    expect(get(breadcrumb)).toEqual([{ label: 'Payments', href: '/samm/payments' }]);
    breadcrumb.set([]);
  });
});
