/**
 * The ports of the Vite dev server and of the mock server (`web-mock`), from the environment.
 *
 * `TRAILHAND_WEB_PORT` (default 5173) and `TRAILHAND_MOCK_PORT` (default 7420) are the only names; the
 * end-to-end suite passes the same variables.
 */
export interface ResolvedPorts {
  /** The port of the Vite dev server. */
  webPort: number;
  /** The port of the mock server. */
  mockPort: number;
  /** The address the dev server proxies `/api` and `/mock` to. */
  mockTarget: string;
}

function parsePort(name: string, rawValue: string | undefined, defaultPort: number): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultPort;
  }
  const trimmed = rawValue.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid ${name}: "${rawValue}". Expected an integer between 1 and 65535.`);
  }
  const port = Number.parseInt(trimmed, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid ${name}: "${rawValue}". Expected an integer between 1 and 65535.`);
  }
  return port;
}

/**
 * Resolves the ports from the environment or the defaults.
 *
 * @param env the environment, `process.env` by default
 * @returns the ports and the proxy target
 * @throws Error if a variable holds no valid port
 */
export function resolvePorts(env: Record<string, string | undefined> = process.env): ResolvedPorts {
  const webPort = parsePort('TRAILHAND_WEB_PORT', env.TRAILHAND_WEB_PORT, 5173);
  const mockPort = parsePort('TRAILHAND_MOCK_PORT', env.TRAILHAND_MOCK_PORT, 7420);
  return { webPort, mockPort, mockTarget: `http://127.0.0.1:${mockPort}` };
}

/**
 * Whether the dev server must hold an assigned port instead of moving to the next free one.
 *
 * @param env the environment, `process.env` by default
 * @returns `true` when `TRAILHAND_WEB_PORT` names a port
 */
export function holdsAssignedPort(env: Record<string, string | undefined> = process.env): boolean {
  return (env.TRAILHAND_WEB_PORT ?? '').trim() !== '';
}
