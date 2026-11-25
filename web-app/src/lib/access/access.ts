/**
 * What the shell reads from the status and the session about access (doc/specification/rest-api.adoc: `GET
 * /api/v1/status`, A Session Without Rights).
 */
import type { LoginProvider, Session, Status, StepUpMethod } from '../api/types';

/**
 * @param status the status, `null` while it is not read
 * @returns the login provider; an absent member reads as `oidc` (decided provisionally)
 */
export function loginProviderOf(status: Status | null): LoginProvider {
  return status?.loginProvider === 'local' ? 'local' : 'oidc';
}

/**
 * @param status the status, `null` while it is not read
 * @returns how step-up confirms; an absent member means `mfa` with `oidc` and `off` with `local`, the defaults of
 * AUN-AUTH-4
 */
export function stepUpMethodOf(status: Status | null): StepUpMethod {
  if (status?.stepUp) return status.stepUp;
  return loginProviderOf(status) === 'local' ? 'off' : 'mfa';
}

/**
 * @param session the session, `null` while it is not read
 * @returns whether the user is logged in but holds no right on any repository and has no first login to complete: the
 * shell then says so and shows the empty state in place of every list, and never asks for another login
 */
export function hasNoRights(session: Session | null): boolean {
  return session !== null && session.rights.length === 0 && !session.firstLoginRequired;
}

/** The server's login start, which a login with the identity provider begins with. */
export const PROVIDER_LOGIN = '/api/v1/auth/login';

/**
 * @param provider how the installation logs in
 * @param returnAddress the checked address to come back to (`checkReturn`)
 * @returns the address that starts the login: the server's login start with the identity provider, the web app's own
 * page `/login` with local users
 */
export function loginStartAddress(provider: LoginProvider, returnAddress: string): string {
  const target = provider === 'local' ? '/login' : PROVIDER_LOGIN;
  return `${target}?return=${encodeURIComponent(returnAddress)}`;
}
