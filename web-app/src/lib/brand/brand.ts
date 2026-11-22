/**
 * The brand of Audit Notary (doc/concepts/brand.adoc).
 *
 * The name is decided; the mark is **provisional** until the final drawing is delivered and accepted
 * (brand.adoc, Open Decisions). The visible name stays beside the mark, the mark never changes with state,
 * and it never appears in a generated document.
 */

/** The catalogue key of the visible name. */
export const BRAND_NAME_KEY = 'brand.name';

/** The catalogue key of the descriptor under the name. */
export const BRAND_TAGLINE_KEY = 'brand.tagline';

/** The catalogue key of the mark's accessible name, where it stands without the visible name. */
export const BRAND_MARK_KEY = 'brand.mark';

/** Whether the mark is still the provisional drawing; it must be replaced before the first release (brand.adoc). */
export const MARK_IS_PROVISIONAL = true;

/** The renderings of the mark: colour on calm surfaces, one colour following `currentColor`. */
export type MarkRendering = 'colour' | 'monochrome';
