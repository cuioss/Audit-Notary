import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import type { SammModel } from '../api/types';
import { clearModels, loadModel } from './store';

afterEach(() => clearModels());

describe('loadModel', () => {
  it('reads a model once per visit', async () => {
    const model = { version: 'v1' } as unknown as SammModel;
    const read = vi.spyOn(apiClient, 'getSammModel').mockResolvedValue(model);
    await expect(loadModel('v1')).resolves.toBe(model);
    await expect(loadModel('v1')).resolves.toBe(model);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed read so the next one tries again', async () => {
    const read = vi
      .spyOn(apiClient, 'getSammModel')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ version: 'v1' } as unknown as SammModel);
    await expect(loadModel('v1')).rejects.toThrow('down');
    await expect(loadModel('v1')).resolves.toMatchObject({ version: 'v1' });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reads again after clearModels', async () => {
    const read = vi
      .spyOn(apiClient, 'getSammModel')
      .mockResolvedValue({ version: 'v1' } as unknown as SammModel);
    await loadModel('v1');
    clearModels();
    await loadModel('v1');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
