import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_PORT, MOCK_URL, PORTS_ASSIGNED } from './tests/helpers/ports.js';

/**
 * Starts web-mock through its own script (web-mock/start.sh, profile workshop, timing ordered) unless one
 * already answers on the port, and stops it again after the suite.
 */
const WEB_MOCK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web-mock');

async function mockAnswers() {
  try {
    const response = await fetch(`${MOCK_URL}/mock/state`);
    return response.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (await mockAnswers()) {
    if (PORTS_ASSIGNED || process.env.CI) {
      throw new Error(`a server already answers on the assigned mock port ${MOCK_PORT}`);
    }
    console.info(`web-e2e: reusing the mock server on ${MOCK_URL}`);
    return () => {};
  }
  execFileSync(
    path.join(WEB_MOCK, 'start.sh'),
    ['-s', 'workshop', '-p', String(MOCK_PORT), '-t', 'ordered'],
    {
      stdio: 'inherit',
    },
  );
  return () => {
    execFileSync(path.join(WEB_MOCK, 'stop.sh'), [], { stdio: 'inherit' });
  };
}
