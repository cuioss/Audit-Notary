<script lang="ts">
  import Button from './Button.svelte';

  /**
   * The pick of files from the device: an act (a button of the closed vocabulary) that opens the system's file
   * dialog. The files are read by the caller, in the browser; nothing is uploaded by the picker itself. The same file
   * may be picked again after it was removed.
   */
  interface Props {
    /** The label of the act. */
    label: string;
    /** The file types the dialog offers, as the `accept` attribute of a file input. */
    accept?: string;
    /** Whether several files may be picked at once. */
    multiple?: boolean;
    /** Why no file can be picked now; the act stays focusable and says it. */
    disabledReason?: string | null;
    /** The icon left of the label. */
    icon?: string;
    /** Called with the picked files, in the order the dialog gave them. */
    onpick: (files: File[]) => void;
    /** A test id; the file input has `<testId>-input`. */
    testId?: string;
  }

  let {
    label,
    accept,
    multiple = false,
    disabledReason = null,
    icon,
    onpick,
    testId,
  }: Props = $props();

  let input: HTMLInputElement | undefined = $state();

  function picked() {
    if (!input) return;
    const files = [...(input.files ?? [])];
    // Cleared, so the same file can be picked a second time.
    input.value = '';
    if (files.length > 0) onpick(files);
  }
</script>

<input
  bind:this={input}
  type="file"
  hidden
  {accept}
  {multiple}
  onchange={picked}
  data-testid={testId ? `${testId}-input` : undefined}
/>
<Button {icon} {disabledReason} onclick={() => input?.click()} data-testid={testId}>
  {label}
</Button>
