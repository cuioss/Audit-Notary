<script lang="ts">
  import Link from '../components/Link.svelte';
  import SafeNodes from './SafeNodes.svelte';
  import { VOID_ELEMENTS, type SafeNode } from './sanitize';

  /**
   * Draws the nodes of a sanitised preview with elements of its own: no string is inserted as markup, so no view needs
   * `{@html}` (AUN-WEB-4, AsciiDoc Preview). The nodes are those of `sanitizeHtml`: only the allow-list got through.
   */
  interface Props {
    /** The nodes. */
    nodes: SafeNode[];
  }

  let { nodes }: Props = $props();
</script>

{#each nodes as node, index (index)}
  {#if node.type === 'text'}
    {node.text}
  {:else if node.tag === 'a'}
    <Link href={node.attrs.href} rel={node.attrs.rel}><SafeNodes nodes={node.children} /></Link>
  {:else if VOID_ELEMENTS.has(node.tag)}
    <svelte:element this={node.tag} />
  {:else}
    <svelte:element this={node.tag} {...node.attrs}>
      <SafeNodes nodes={node.children} />
    </svelte:element>
  {/if}
{/each}
