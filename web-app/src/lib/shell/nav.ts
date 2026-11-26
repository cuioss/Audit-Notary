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

/** The generic documents lens, the ninth entry (rest-api.adoc, The Generic Documents Lens). */
const DOCUMENTS_ITEM: NavItem = item('categories');

/**
 * @param documents whether the generic documents lens exists: `GET /api/v1/categories` lists a generic category
 * @returns the rail's groups; the lens *Documents* stands between ISMS and Catalogs only while it exists
 */
export function railGroups(documents: boolean): NavGroup[] {
  if (!documents) return RAIL_GROUPS;
  return RAIL_GROUPS.map((group, index) =>
    index === 0 ? { ...group, items: [...group.items, DOCUMENTS_ITEM] } : group,
  );
}

/**
 * @param documents whether the generic documents lens exists
 * @returns every lens in rail order
 */
export function allItems(documents: boolean): NavItem[] {
  return [...railGroups(documents).flatMap((group) => group.items), RAIL_FOOT];
}

/** Every lens in rail order, without the lens that exists only where a generic category does. */
export const ALL_ITEMS: NavItem[] = allItems(false);

/** The number of lenses of the phone's bottom bar. */
const BOTTOM_COUNT = 4;

/**
 * @param documents whether the generic documents lens exists
 * @returns the lenses of the phone's bottom bar
 */
export function bottomItems(documents: boolean): NavItem[] {
  return allItems(documents).slice(0, BOTTOM_COUNT);
}

/**
 * @param documents whether the generic documents lens exists
 * @returns the lenses behind "More"
 */
export function moreItems(documents: boolean): NavItem[] {
  return allItems(documents).slice(BOTTOM_COUNT);
}

/** The lenses of the phone's bottom bar; the others are behind "More". */
export const BOTTOM_ITEMS: NavItem[] = bottomItems(false);

/** The lenses behind "More". */
export const MORE_ITEMS: NavItem[] = moreItems(false);

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
