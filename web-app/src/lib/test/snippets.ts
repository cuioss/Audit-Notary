import { createRawSnippet } from 'svelte';

/**
 * @param text the text of the snippet (test data, not a user-facing text)
 * @returns a snippet that renders the text in a span
 */
export function textSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}
