import { describe, expect, it } from 'vitest';
import { holdsAssignedPort, resolvePorts } from './ports';

describe('ports', () => {
  it('defaults to 5173 and 7420', () => {
    expect(resolvePorts({})).toEqual({
      webPort: 5173,
      mockPort: 7420,
      mockTarget: 'http://127.0.0.1:7420',
    });
    expect(holdsAssignedPort({})).toBe(false);
  });

  it('reads the environment and refuses a value that is no port', () => {
    expect(resolvePorts({ AUDIT_NOTARY_WEB_PORT: '6000', AUDIT_NOTARY_MOCK_PORT: '8000' })).toMatchObject(
      {
        webPort: 6000,
        mockPort: 8000,
      },
    );
    expect(holdsAssignedPort({ AUDIT_NOTARY_WEB_PORT: '6000' })).toBe(true);
    expect(() => resolvePorts({ AUDIT_NOTARY_WEB_PORT: 'abc' })).toThrow('Invalid AUDIT_NOTARY_WEB_PORT');
    expect(() => resolvePorts({ AUDIT_NOTARY_MOCK_PORT: '70000' })).toThrow(
      'Invalid AUDIT_NOTARY_MOCK_PORT',
    );
  });
});
