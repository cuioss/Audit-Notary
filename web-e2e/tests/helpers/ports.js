/**
 * The ports of the suite: the only place that names them (scripts/guard-ports.js). The same variables as
 * web-app/src/lib/ports.ts: AUDIT_NOTARY_WEB_PORT (Vite dev server) and AUDIT_NOTARY_MOCK_PORT (web-mock).
 */

function parsePort(name, defaultPort) {
  const raw = (process.env[name] ?? '').trim();
  if (raw === '') return defaultPort;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error(`Invalid ${name}: "${raw}". Expected an integer between 1 and 65535.`);
  }
  return Number(raw);
}

/** The port of the Vite dev server of web-app. */
export const WEB_PORT = parsePort('AUDIT_NOTARY_WEB_PORT', 5173);

/** The port of the mock server. */
export const MOCK_PORT = parsePort('AUDIT_NOTARY_MOCK_PORT', 7420);

/** Whether a port was assigned, so a running server on it must not be reused silently. */
export const PORTS_ASSIGNED =
  (process.env.AUDIT_NOTARY_WEB_PORT ?? '').trim() !== '' ||
  (process.env.AUDIT_NOTARY_MOCK_PORT ?? '').trim() !== '';

/** The address of the app. */
export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;

/** The address of the mock server itself. */
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
