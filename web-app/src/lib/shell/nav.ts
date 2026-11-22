/**
 * The lenses on the navigation rail and on the phone's bottom bar (AUN-WEB-3).
 */
import { lensAddress, type Lens } from '../routes';

/** One entry of the rail. */
export interface NavItem {
  lens: Lens;
  href: string;
  labelKey: string;
  icon: string;
  testId: string;
}

/** One group of the rail. */
export interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

function item(lens: Lens): NavItem {
  return {
    lens,
    href: lensAddress(lens),
    labelKey: `lens.${lens}`,
    icon: `lens.${lens}`,
    testId: `nav-${lens}`,
  };
}

/** The rail: the work lenses, then the registers; Settings sits at the rail's foot. */
export const RAIL_GROUPS: NavGroup[] = [
  {
    titleKey: 'shell.group.work',
    items: [item('due'), item('samm'), item('threat-models'), item('incidents'), item('isms')],
  },
  { titleKey: 'shell.group.registers', items: [item('catalogs'), item('reports')] },
];

/** The entry at the rail's foot. */
export const RAIL_FOOT: NavItem = item('settings');

/** Every lens in rail order. */
export const ALL_ITEMS: NavItem[] = [...RAIL_GROUPS.flatMap((group) => group.items), RAIL_FOOT];

/** The lenses of the phone's bottom bar; the others are behind "More". */
export const BOTTOM_ITEMS: NavItem[] = ALL_ITEMS.slice(0, 4);

/** The lenses behind "More". */
export const MORE_ITEMS: NavItem[] = ALL_ITEMS.slice(4);

/** The storage key of the rail's collapsed state. */
export const RAIL_COLLAPSED_KEY = 'audit_notary_rail_collapsed';

/** @returns whether this browser collapsed the rail */
export function readRailCollapsed(): boolean {
  try {
    return (
      typeof window !== 'undefined' && window.localStorage.getItem(RAIL_COLLAPSED_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

/** @param collapsed whether the rail shows icons only */
export function writeRailCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(RAIL_COLLAPSED_KEY, String(collapsed));
  } catch {
    // Storage refused: the choice holds for this visit.
  }
}
