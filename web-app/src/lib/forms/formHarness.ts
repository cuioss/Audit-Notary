/**
 * What the tests of the form components share: opening a fixture category over the workshop profile.
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { vi } from 'vitest';
import type { JsonObject } from './schema';
import SchemaForm from './SchemaForm.svelte';
import { useMessages, useProfile } from './testkit';

/** The fixture categories of the mock. */
export type FixtureCategory = 'test-note' | 'form-sections' | 'form-validation';

/**
 * Opens the form of a fixture category over a profile.
 *
 * @param category the category
 * @param value the value to edit
 * @param props more properties of the form
 * @param profile the profile, with an optional state
 * @returns the kit, the schema, the change spy and the rendered form
 */
export async function open(
  category: FixtureCategory,
  value: JsonObject = {},
  props: Record<string, unknown> = {},
  profile = 'workshop',
) {
  // The schema always comes from the workshop; the profile is what the services meet afterwards.
  // The kind is the first one of the category's answer, so that the schema and the kind of the texts cannot part.
  const { id: kind, schema } = (await useProfile('workshop').client.getCategorySchema(category))
    .kinds[0];
  const kit = useProfile(profile);
  useMessages('en');
  const onchange = vi.fn();
  const view = render(SchemaForm, {
    schema,
    category,
    kind,
    value,
    services: kit.services,
    onchange,
    ...props,
  });
  return { kit, schema, onchange, ...view };
}

/**
 * @param label the start of a label
 * @returns the control whose label starts with the text
 */
export function field(label: string): HTMLElement {
  // eslint-disable-next-line security/detect-non-literal-regexp -- a label of a test
  return screen.getByLabelText(new RegExp(`^${label}`));
}

/**
 * @param onchange the spy of `onchange`
 * @returns the value of the last change
 */
export function last(onchange: ReturnType<typeof vi.fn>): JsonObject {
  return onchange.mock.calls.at(-1)![0] as JsonObject;
}

/**
 * @param holder the element that holds the field
 * @param text the text it must come to hold
 * @returns when the text appears
 */
export async function appears(text: string | RegExp): Promise<HTMLElement> {
  return screen.findByText(text);
}

export { fireEvent, screen };
