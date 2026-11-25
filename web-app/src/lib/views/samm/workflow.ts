/**
 * The words and tones of the workflow states (draft, in review, released) as the SAMM views show them.
 */
import type { StatusTone } from '../../components/StatusLabel.svelte';
import type { WorkflowState } from '../../api/types';

/**
 * @param state a workflow state
 * @returns the tone of its state label: a released document wears the seal
 */
export function stateTone(state: WorkflowState): StatusTone {
  switch (state) {
    case 'released':
      return 'sealed';
    case 'in-review':
      return 'running';
    default:
      return 'neutral';
  }
}

/**
 * @param tag a release tag, `assessments/<id>/v1`
 * @returns its version, `v1`
 */
export function versionOf(tag: string): string {
  return tag.split('/').at(-1) ?? tag;
}
