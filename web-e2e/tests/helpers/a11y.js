import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

/** The rule sets of the audit: WCAG 2.1 A and AA (TRH-WEB-2). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** The impacts that fail the audit; moderate and minor findings are reported only. */
export const FAILING_IMPACTS = ['serious', 'critical'];

/**
 * Audits the page and fails on a violation of impact serious or critical.
 *
 * @param page the page
 * @param view the name of the view, for the message
 */
export async function expectNoSeriousViolations(page, view) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const failing = results.violations.filter((violation) =>
    FAILING_IMPACTS.includes(violation.impact),
  );
  for (const violation of results.violations.filter((entry) => !failing.includes(entry))) {
    console.info(`${view}: ${violation.impact} ${violation.id} (${violation.nodes.length})`);
  }
  const summary = failing.map(
    (violation) =>
      `${violation.impact} ${violation.id}: ${violation.help} → ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  );
  expect(summary, `${view}: axe violations`).toEqual([]);
}

/**
 * Sets the theme through the stored choice and reloads.
 *
 * @param page the page
 * @param theme `light` or `dark`
 */
export async function useTheme(page, theme) {
  await page.evaluate((value) => window.localStorage.setItem('trailhand_theme', value), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
