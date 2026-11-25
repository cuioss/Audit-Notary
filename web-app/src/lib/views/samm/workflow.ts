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
 * The release a change is measured from: the latest released assessment before the given one. The scope lists its
 * assessments newest first, so it is the first released entry after the given one, never a later release.
 *
 * @param assessments the scope's assessments, newest first
 * @param id the address segment of the assessment
 * @returns the previous release, or `null`
 */
export function previousRelease<T extends { id: string; state: WorkflowState }>(
  assessments: T[],
  id: string,
): T | null {
  const index = assessments.findIndex((entry) => entry.id === id);
  return assessments.slice(index + 1).find((entry) => entry.state === 'released') ?? null;
}

/**
 * @param tag a release tag, `assessments/<id>/v1`
 * @returns its version, `v1`
 */
export function versionOf(tag: string): string {
  return tag.split('/').at(-1) ?? tag;
}
