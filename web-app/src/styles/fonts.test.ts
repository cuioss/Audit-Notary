import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Inter, self-hosted (AUN-WEB-2): the variable `woff2` and its licence ship from `static/fonts/`.
 */
describe('self-hosted Inter', () => {
  const fontsDir = path.resolve(__dirname, '../../static/fonts');

  it('ships the variable woff2', () => {
    const font = fs.readFileSync(path.join(fontsDir, 'InterVariable.woff2'));

    expect(font.length).toBeGreaterThan(100_000);
    expect(font.subarray(0, 4).toString('latin1')).toBe('wOF2');
  });

  it('ships the SIL Open Font License beside it', () => {
    const licence = fs.readFileSync(path.join(fontsDir, 'OFL.txt'), 'utf8');

    expect(licence).toContain('SIL OPEN FONT LICENSE');
    expect(licence).toContain('The Inter Project Authors');
  });
});
