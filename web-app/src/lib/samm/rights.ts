/**
 * What the session may do with the SAMM assessments (AUN-SAMM, rest-api.adoc, SAMM Requests, point 17): creating a scope,
 * saving its targets and creating an assessment need `edit` on `samm-assessments`; reading needs `read`.
 */
import type { Session } from '../api/types';

/** The repository of the SAMM scopes and assessments. */
export const SAMM_REPOSITORY = 'samm-assessments';

/**
 * @param session the session, or `null` before it is read
 * @returns whether the user holds `edit` on the SAMM repository
 */
export function canEditSamm(session: Session | null): boolean {
  return (
    session?.rights.some(
      (right) => right.repository === SAMM_REPOSITORY && right.actions.includes('edit'),
    ) ?? false
  );
}
