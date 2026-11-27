import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { session } from '../stores/app';
import { DocumentController } from './controller.svelte';

/**
 * A save over a stage that was completed meanwhile (rest-api.adoc, Creating and Saving): the refusal writes nothing, keeps
 * the changes as the person's and asks the view to read the document again, so that the stage shows as completed.
 */
afterEach(() => session.set(null));

describe('a save refused with STAGE_LOCKED', () => {
  it('keeps the changes, says why and reads the document again', async () => {
    const client = {
      saveDocument: vi
        .fn()
        .mockRejectedValue(
          new ApiError('STAGE_LOCKED', 409, [], { outcome: 'STAGE_LOCKED', stages: ['triage'] }),
        ),
      saveDraft: vi.fn().mockResolvedValue({ outcome: 'DRAFT_SAVED', at: '2026-11-26T10:00:00Z' }),
    } as unknown as ApiClient;
    const onrefresh = vi.fn();
    const controller = new DocumentController({
      repository: 'isms-incidents-2026',
      client,
      onrefresh,
      releasedOnce: true,
      drafts: false,
      self: () => 'p-me',
    });
    controller.sync({
      document: 'D1',
      part: 'triage',
      blob: 'abc',
      savedBy: null,
      value: { severity: 'low' },
      frozen: false,
      canEdit: true,
    });
    controller.change('/severity', 'high');
    await controller.save();
    expect(controller.saveState).toBe('failed');
    expect(controller.failure).toBe('error.stage-locked');
    expect(controller.edits['/severity']).toBe('high');
    expect(onrefresh).toHaveBeenCalledOnce();
  });
});
