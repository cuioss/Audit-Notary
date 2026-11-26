import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { DocumentRead, Person, Saved } from '../api/types';
import { SAMM_KEYS } from '../samm/fieldKeys';
import { scenarioFetch } from '../test/scenarioFetch';
import { session, status } from '../stores/app';
import {
  DRAFT_DELAY_MS,
  DocumentController,
  type DocumentControllerOptions,
  type DocumentSnapshot,
} from './controller.svelte';

/**
 * The document controller against the `note-*` states of the `workshop` profile (AUN-TEST-1): one test per outcome of
 * the document lifecycle (rest-api.adoc, Document Lifecycle Requests).
 */
const REPOSITORY = 'test-notes';
const N1 = '01JZ8Q4Y5N6V7X8B9C0D1E2F3G';
const N2 = '01JZ8R7A9C1E3G5J7M9P1S3V5X';
const N3 = '01JZ8S2B4D6F8H0K2N4Q6T8W0Y';
const N6 = '01JZ8W1E3G5J7M9P1R3T5X7Z9B';
const ALEX = 'p-4c1a9e';

interface Opened {
  client: ApiClient;
  controller: DocumentController;
  document: DocumentRead;
  navigate: ReturnType<typeof vi.fn>;
  scenario: ReturnType<typeof scenarioFetch>;
  options: DocumentControllerOptions;
}

/**
 * @param document a read
 * @param change what to override
 * @returns the snapshot of its single part, as a view passes it
 */
function snapshotOf(
  document: DocumentRead,
  change: Partial<DocumentSnapshot> = {},
): DocumentSnapshot {
  const part = document.parts.data;
  return {
    document: document.id,
    part: 'data',
    blob: part.blob,
    savedBy: part.savedBy,
    value: part.value,
    draft: document.draft,
    frozen: document.frozen,
    canEdit: true,
    ...change,
  };
}

/**
 * Stubs fetch with a profile, reads a note and gives a controller its snapshot.
 *
 * @param profile `name` or `name#state`
 * @param id the note
 * @param extra options of the controller
 * @param shown what to override in the snapshot, such as `draft: null` for a page that starts without a draft
 * @returns what a test needs
 */
async function open(
  profile: string,
  id = N2,
  extra: Partial<DocumentControllerOptions> = {},
  shown: Partial<DocumentSnapshot> = {},
): Promise<Opened> {
  const scenario = scenarioFetch(profile);
  vi.stubGlobal('fetch', scenario.fetch);
  const navigate = vi.fn();
  const client = new ApiClient(navigate as unknown as (address: string) => void);
  const document = await client.getDocument(REPOSITORY, id);
  const options: DocumentControllerOptions = {
    repository: REPOSITORY,
    client,
    self: () => ALEX,
    ...extra,
  };
  const controller = new DocumentController(options);
  controller.sync(snapshotOf(document, shown));
  return { client, controller, document, navigate, scenario, options };
}

/** @returns the person of a pseudonym, for a snapshot */
function person(pseudonym: string, name: string): Person {
  return { pseudonym, name };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  session.set(null);
  status.set(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the draft (AUN-WEB-5)', () => {
  it('keeps the changes within the 5 seconds the requirements allow', () => {
    expect(DRAFT_DELAY_MS).toBeLessThanOrEqual(5000);
  });

  it('keeps a change as the draft after its delay, with the blob the form loaded and the JSON Pointer as key', async () => {
    const { controller, client } = await open('workshop', N2, {}, { draft: null });
    const draft = vi.spyOn(client, 'saveDraft');
    controller.change('/status', 'agreed');
    expect(controller.saveState).toBe('changed');
    expect(draft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(draft).toHaveBeenCalledWith(REPOSITORY, N2, {
      parts: { data: { blob: '3f9a1c2', fields: { '/status': 'agreed' } } },
    });
    expect(controller.saveState).toBe('draft');
    expect(controller.stampAt).toBeInstanceOf(Date);
  });

  it('writes one draft for a burst of changes', async () => {
    const { controller, client } = await open('workshop', N2, {}, { draft: null });
    const draft = vi.spyOn(client, 'saveDraft');
    controller.change('/status', 'agreed');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS - 100);
    controller.change('/status', 'dropped');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS - 100);
    expect(draft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft.mock.calls[0][2].parts.data.fields).toEqual({ '/status': 'dropped' });
  });

  it('ignores a change that sets the same value again, and says clean when everything is changed back', async () => {
    const { controller, client, document } = await open('workshop', N3);
    const draft = vi.spyOn(client, 'saveDraft');
    controller.setValue({ ...controller.value, summary: 'x' });
    const timers = vi.getTimerCount();
    controller.setValue({ ...controller.value });
    expect(vi.getTimerCount()).toBe(timers);
    controller.setValue(document.parts.data.value);
    expect(controller.dirty).toBe(false);
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(draft).not.toHaveBeenCalled();
    expect(controller.saveState).toBe('clean');
  });

  it('restores the own draft with the document, as edits shown over the loaded value', async () => {
    const { controller, document } = await open('workshop');
    expect(controller.edits).toEqual({
      '/summary': 'Keep audit evidence for ten years; review it every year.',
      '/pinned': true,
    });
    expect(controller.saveState).toBe('draft');
    expect(controller.stampAt?.toISOString()).toBe('2026-11-26T08:30:00.000Z');
    expect(controller.draftStale).toBe(false);
    expect(controller.dirty).toBe(true);
    expect(controller.value.summary).toBe(
      'Keep audit evidence for ten years; review it every year.',
    );
    expect(controller.value.pinned).toBe(true);
    expect(document.parts.data.value.pinned).toBe(false);
  });

  it('marks a draft that started from an older blob, and saves it on that blob so the server finds the conflicts', async () => {
    const { controller, client, document } = await open('workshop');
    const older = {
      ...document,
      draft: {
        at: document.draft!.at,
        parts: { data: { blob: 'older00', fields: { '/pinned': true } } },
      },
    };
    controller.sync(snapshotOf(older, { document: 'N-other' }));
    expect(controller.draftStale).toBe(true);
    const save = vi.spyOn(client, 'saveDocument');
    await controller.save();
    expect(save.mock.calls[0][2].parts.data.blob).toBe('older00');
  });

  it('starts clean for a document with no draft or an empty one', async () => {
    const { controller, document } = await open('workshop', N3);
    expect(controller.saveState).toBe('clean');
    controller.sync(
      snapshotOf(
        {
          ...document,
          draft: { at: '2026-11-26T08:30:00Z', parts: { data: { blob: 'x', fields: {} } } },
        },
        { document: 'x' },
      ),
    );
    expect(controller.saveState).toBe('clean');
    expect(controller.dirty).toBe(false);
  });

  it('keeps the unsaved changes of a document as its draft when another one opens', async () => {
    const { controller, client } = await open('workshop', N3);
    const draft = vi.spyOn(client, 'saveDraft');
    controller.change('/status', 'open');
    const other = await client.getDocument(REPOSITORY, N1);
    controller.sync(snapshotOf(other));
    expect(draft).toHaveBeenCalledWith(
      REPOSITORY,
      N3,
      expect.objectContaining({ parts: expect.anything() }),
    );
    expect(controller.dirty).toBe(false);
    expect(controller.saveState).toBe('clean');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS * 2);
    expect(draft).toHaveBeenCalledTimes(1);
  });

  it('does not stop on a flush that fails', async () => {
    const { controller, client } = await open('workshop', N3);
    vi.spyOn(client, 'saveDraft').mockRejectedValue(new Error('down'));
    controller.change('/status', 'open');
    controller.sync(null);
    await vi.advanceTimersByTimeAsync(10);
    expect(controller.readonly).toBe(true);
  });

  it('keeps the pending changes as the draft when it is closed', async () => {
    const { controller, client } = await open('workshop', N3);
    const draft = vi.spyOn(client, 'saveDraft');
    controller.change('/status', 'open');
    controller.destroy();
    expect(draft).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS * 2);
    expect(draft).toHaveBeenCalledTimes(1);
  });

  it('says that the text stays in the page when the draft is refused for its field errors', async () => {
    const { controller } = await open('workshop#note-invalid');
    controller.change('/owner', 'p-unknown');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(controller.saveState).toBe('failed');
    expect(controller.draftRefused).toBe(true);
    expect(controller.failure).toBe('error.validation');
    expect(controller.errors?.map((entry) => entry.pointer)).toEqual([
      '/related',
      '/owner',
      '/actions/1/what',
    ]);
    expect(controller.edits['/owner']).toBe('p-unknown');
    // No retry loop: the next change tries again.
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS * 3);
    expect(controller.saveState).toBe('failed');
  });

  it('keeps working while the Git server is unreachable: a draft needs no Git', async () => {
    const { controller } = await open('workshop#note-git-unavailable');
    controller.change('/status', 'agreed');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(controller.saveState).toBe('draft');
  });

  it('says when a draft cannot be kept, and keeps the changes', async () => {
    const { controller, client } = await open('workshop', N3);
    vi.spyOn(client, 'saveDraft').mockRejectedValue(new ApiError('NETWORK', 0));
    controller.change('/status', 'open');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(controller.saveState).toBe('failed');
    expect(controller.failure).toBe('error.network');
    expect(controller.draftRefused).toBe(false);
    expect(controller.edits['/status']).toBe('open');
  });
});

describe('the save for everyone', () => {
  it('writes the changes with the blob the form loaded, shows them at once and reads the next blob from the answer', async () => {
    const onsaved = vi.fn();
    const { controller, client } = await open('workshop', N2, { onsaved });
    const save = vi.spyOn(client, 'saveDocument');
    controller.change('/status', 'agreed');
    await controller.save();
    expect(save).toHaveBeenCalledWith(
      REPOSITORY,
      N2,
      {
        parts: {
          data: { blob: '3f9a1c2', fields: expect.objectContaining({ '/status': 'agreed' }) },
        },
      },
      undefined,
    );
    expect(controller.saveState).toBe('saved');
    expect(controller.dirty).toBe(false);
    expect(controller.fieldValue('/status', 'open')).toBe('agreed');
    expect(controller.value.status).toBe('agreed');
    expect(onsaved).toHaveBeenCalledOnce();
    expect(controller.stampAt?.toISOString()).toBe('2026-11-26T09:45:00.000Z');
    // Before the view has read the document again, the next change stands on the blob the save wrote.
    controller.change('/status', 'dropped');
    await controller.save();
    expect(save.mock.calls[1][2].parts.data.blob).toBe('b8c0d41');
  });

  it('lets the read of the new blob take the overlay away, and tells a save by another person', async () => {
    const onremote = vi.fn();
    const { controller, document, client } = await open('workshop', N3, { onremote });
    controller.change('/summary', 'New summary.');
    await controller.save();
    expect(controller.fieldValue('/summary', 'Old')).toBe('New summary.');
    controller.sync(
      snapshotOf(document, { blob: 'b8c0d41', savedBy: person(ALEX, 'Alex Example') }),
    );
    expect(controller.fieldValue('/summary', 'Old')).toBe('Old');
    expect(onremote).not.toHaveBeenCalled();
    expect(controller.remote).toBeNull();
    // Then someone else saves.
    const stored = await client.getDocument(REPOSITORY, N3);
    controller.sync(
      snapshotOf(stored, { blob: 'c9d0e12', savedBy: person('p-2b7f10', 'Jordan Weber') }),
    );
    expect(onremote).toHaveBeenCalledOnce();
    expect(controller.remote?.name).toBe('Jordan Weber');
  });

  it('refreshes what nobody changed here and keeps what was changed here', async () => {
    const onremote = vi.fn();
    const { controller, client } = await open('workshop', N2, { onremote }, { draft: null });
    controller.change('/summary', 'My summary.');
    const scenario = scenarioFetch('workshop#note-saved-by-other');
    vi.stubGlobal('fetch', scenario.fetch);
    const remote = await client.getDocument(REPOSITORY, N2);
    controller.sync(snapshotOf(remote));
    expect(onremote).toHaveBeenCalledWith({
      by: expect.objectContaining({ name: 'Jordan Weber' }),
      edited: new Set(['/summary']),
    });
    // The own change stays, the other's `pinned` is shown unless it was changed here too.
    expect(controller.value.summary).toBe('My summary.');
    expect(controller.value.pinned).toBe(true);
    expect(controller.edits['/summary']).toBe('My summary.');
  });

  it('keeps a change made while the save runs for the next save', async () => {
    const { controller, client } = await open('workshop', N3);
    let finish: (value: Saved) => void = () => {};
    const save = vi
      .spyOn(client, 'saveDocument')
      .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    controller.change('/summary', 'First.');
    const running = controller.save();
    controller.change('/status', 'open');
    expect(controller.saveState).toBe('saving');
    finish({ outcome: 'SAVED', at: '2026-11-26T10:00:00Z', parts: {} });
    await running;
    expect(controller.saveState).toBe('changed');
    expect(controller.edits).toEqual({ '/status': 'open' });
    expect(save.mock.calls[0][2].parts.data.fields).toEqual({ '/summary': 'First.' });
    expect(controller.fieldValue('/summary', 'x')).toBe('First.');
  });

  it('sends one save for a second press while the first runs', async () => {
    const { controller, client } = await open('workshop', N3);
    let finish: (value: Saved) => void = () => {};
    const save = vi
      .spyOn(client, 'saveDocument')
      .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    controller.change('/summary', 'First.');
    const running = controller.save();
    await controller.save();
    finish({ outcome: 'SAVED', at: '2026-11-26T10:00:00Z', parts: {} });
    await running;
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.saveState).toBe('saved');
  });

  it('does not apply the answer of a save to the document opened meanwhile', async () => {
    const { controller, client, options } = await open('workshop', N3);
    const onsaved = vi.fn();
    options.onsaved = onsaved;
    let finish: (value: Saved) => void = () => {};
    vi.spyOn(client, 'saveDocument').mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    controller.change('/status', 'open');
    const running = controller.save();
    const other = await client.getDocument(REPOSITORY, N1);
    controller.sync(snapshotOf(other));
    controller.change('/status', 'open');
    finish({ outcome: 'SAVED', at: '2026-11-26T10:00:00Z', parts: {} });
    await running;
    expect(controller.edits).toEqual({ '/status': 'open' });
    expect(controller.saveState).toBe('changed');
    expect(onsaved).toHaveBeenCalledTimes(1);
  });

  it('sends nothing while a conflict is undecided', async () => {
    const { controller, client } = await open('workshop#note-conflict');
    const save = vi.spyOn(client, 'saveDocument');
    controller.change('/summary', 'Rotate every 90 days.');
    await controller.save();
    expect(controller.open).toBe(2);
    await controller.save();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does nothing without changes', async () => {
    const { controller, client } = await open('workshop', N3);
    const save = vi.spyOn(client, 'saveDocument');
    await controller.save();
    expect(save).not.toHaveBeenCalled();
    expect(controller.saveState).toBe('clean');
  });

  it('starts the next version when a released document is saved: draft again, one version higher', async () => {
    const { controller } = await open('workshop', N1);
    controller.change('/summary', 'Rotate every 60 days.');
    await controller.save();
    expect(controller.reopened).toEqual({ state: 'draft', version: 2 });
    expect(controller.saveState).toBe('saved');
  });

  it('shows no next version for a save that names none', async () => {
    const { controller } = await open('workshop', N2);
    controller.change('/status', 'agreed');
    await controller.save();
    expect(controller.reopened).toBeNull();
  });
});

describe('conflicts (AUN-WEB-5)', () => {
  it('holds a conflict per field with both values, lets the person decide, and saves the decision on the new blob', async () => {
    const { controller, client } = await open('workshop#note-conflict');
    const save = vi.spyOn(client, 'saveDocument');
    controller.change('/summary', 'Rotate every 90 days.');
    controller.change('/status', 'agreed');
    await controller.save();
    expect(controller.saveState).toBe('conflict');
    expect(controller.open).toBe(2);
    expect(controller.conflicts['/summary']).toMatchObject({
      own: 'Rotate every 90 days.',
      other: 'Rotate every 60 days.',
      by: { name: 'Jordan Weber' },
    });
    expect(controller.conflicts['/status'].other).toBe('dropped');

    controller.resolve('/summary', 'own');
    expect(controller.open).toBe(1);
    expect(controller.edits['/summary']).toBe('Rotate every 90 days.');
    controller.resolve('/status', 'other');
    expect(controller.open).toBe(0);
    expect(controller.edits['/status']).toBe('dropped');
    controller.resolve('/status', 'other');

    await controller.save();
    expect(save.mock.calls[1][2].parts.data.blob).toBe('5d1e9a0');
    expect(controller.saveState).toBe('saved');
    expect(controller.conflicts).toEqual({});
  });

  it('keeps a draft written during a conflict on the blob the form loaded, so a reload cannot overwrite the other value', async () => {
    const { controller, client } = await open('workshop#note-conflict');
    const draft = vi.spyOn(client, 'saveDraft');
    controller.change('/summary', 'Rotate every 90 days.');
    await controller.save();
    expect(controller.open).toBe(2);
    controller.change('/status', 'agreed');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft.mock.calls[0][2].parts.data.blob).not.toBe('5d1e9a0');
  });

  it('keeps the changes as the draft once the last conflict is decided, and takes no decision while locked', async () => {
    const { controller, client } = await open('workshop#note-conflict');
    const draft = vi.spyOn(client, 'saveDraft');
    controller.change('/summary', 'Rotate every 90 days.');
    await controller.save();
    controller.leaving = true;
    controller.resolve('/summary', 'other');
    expect(controller.open).toBe(2);
    controller.leaving = false;
    controller.resolve('/summary', 'own');
    expect(controller.saveState).toBe('conflict');
    controller.resolve('/status', 'own');
    expect(controller.saveState).toBe('changed');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(draft).toHaveBeenCalledTimes(1);
  });

  it('shows the value as it is after a decision, until the document is read again', async () => {
    const { controller } = await open('workshop#note-conflict');
    controller.change('/summary', 'Rotate every 90 days.');
    await controller.save();
    controller.resolve('/summary', 'other');
    await controller.save();
    expect(controller.fieldValue('/summary', 'old')).toBe('Rotate every 60 days.');
  });

  it('takes the other side through the keys of the document type', async () => {
    const { controller, client } = await open('workshop', N2, { keys: SAMM_KEYS });
    vi.spyOn(client, 'saveDocument').mockRejectedValueOnce(
      new ApiError('CONFLICT', 409, [], {
        conflicts: [
          {
            part: 'data',
            blob: 'b2',
            fields: [
              {
                pointer: '/answers/data/q-1/comment',
                own: 'Mine.',
                other: 'Theirs.',
                by: person('p-2b7f10', 'Jordan'),
              },
              {
                pointer: '/answers/data/q-1/answer',
                own: 1,
                other: 'bad',
                by: person('p-2b7f10', 'Jordan'),
              },
            ],
          },
        ],
      }),
    );
    controller.change('q-1/comment', 'Mine.');
    await controller.save();
    controller.resolve('q-1/comment', 'other');
    controller.resolve('q-1/answer', 'other');
    expect(controller.edits['q-1/comment']).toBe('Theirs.');
    expect(controller.edits['q-1/answer']).toBeNull();
  });

  it('reads a conflict that names no field of the part as a failure that keeps the work', async () => {
    const { controller, client } = await open('workshop', N3);
    vi.spyOn(client, 'saveDocument').mockRejectedValueOnce(new ApiError('CONFLICT', 409));
    controller.change('/summary', 'x');
    await controller.save();
    expect(controller.saveState).toBe('failed');
    expect(controller.open).toBe(0);
    expect(controller.edits['/summary']).toBe('x');
  });
});

describe('the refusals of the server', () => {
  it('maps the field errors of a save onto the pointers of the form, by part, and writes nothing', async () => {
    const { controller, client } = await open('workshop#note-invalid');
    const draft = vi.spyOn(client, 'saveDraft');
    controller.change('/related', 'isms-register:risk/R-999');
    await controller.save();
    expect(controller.saveState).toBe('failed');
    expect(controller.failure).toBe('error.validation');
    expect(controller.draftRefused).toBe(true);
    expect(controller.errors).toEqual([
      { part: 'data', pointer: '/related', code: 'REFERENCE_NOT_FOUND' },
      { part: 'data', pointer: '/owner', code: 'PSEUDONYM_UNKNOWN' },
      { part: 'data', pointer: '/actions/1/what', code: 'MAX_LENGTH' },
    ]);
    // A draft would be refused the same: none is tried until the person changes something.
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS * 3);
    expect(draft).not.toHaveBeenCalled();
    expect(controller.edits['/related']).toBe('isms-register:risk/R-999');
  });

  it('forgets the errors of the last verdict once a save goes through', async () => {
    const { controller, scenario } = await open('workshop#note-invalid');
    controller.change('/related', 'x');
    await controller.save();
    expect(controller.errors).not.toBeNull();
    scenario.goto('ready');
    await controller.save();
    expect(controller.errors).toBeNull();
    expect(controller.draftRefused).toBe(false);
    expect(controller.saveState).toBe('saved');
  });

  it('says that the document was released meanwhile, keeps the draft and asks the view to read the document again', async () => {
    const onrefresh = vi.fn();
    const { controller } = await open('workshop#note-released-meanwhile', N2, { onrefresh });
    controller.change('/status', 'agreed');
    await controller.save();
    expect(controller.saveState).toBe('failed');
    expect(controller.releasedMeanwhile).toBe(`notes/${N2}/v1`);
    expect(controller.failure).toBe('error.released-meanwhile');
    expect(onrefresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(controller.saveState).toBe('draft');
    expect(controller.edits['/status']).toBe('agreed');
  });

  it('says that the document is frozen when its type is released once', async () => {
    const { controller } = await open('workshop#note-released-meanwhile', N2, {
      releasedOnce: true,
    });
    controller.change('/status', 'agreed');
    await controller.save();
    expect(controller.failure).toBe('error.document-released');
  });

  it('keeps the changes when the Git server refuses the push', async () => {
    const { controller } = await open('workshop#note-rejected');
    controller.change('/status', 'agreed');
    await controller.save();
    expect(controller.saveState).toBe('failed');
    expect(controller.failure).toBe('error.rejected');
    expect(controller.edits['/status']).toBe('agreed');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(controller.saveState).toBe('draft');
  });

  it('keeps the changes when the Git server cannot be reached, and keeps the draft working', async () => {
    const { controller } = await open('workshop#note-git-unavailable');
    controller.change('/status', 'agreed');
    await controller.save();
    expect(controller.saveState).toBe('failed');
    expect(controller.failure).toBe('error.git-unavailable');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(controller.saveState).toBe('draft');
    expect(controller.dirty).toBe(true);
  });

  it('keeps the changes after a failure that is no refusal of the server', async () => {
    const { controller, client } = await open('workshop', N3);
    vi.spyOn(client, 'saveDocument').mockRejectedValue(new Error('down'));
    controller.change('/status', 'open');
    await controller.save();
    expect(controller.saveState).toBe('failed');
    expect(controller.failure).toBe('error.unexpected');
  });
});

describe('the step-up of a save and a transition (UC-ACC-3)', () => {
  it('asks a local user for the password and sends it with the save', async () => {
    const { controller, client } = await open('workshop#note-release-password');
    status.set(await client.getStatus());
    const save = vi.spyOn(client, 'saveDocument');
    controller.change('/status', 'agreed');
    const running = controller.save();
    await controller.stepUp.submit('local-password');
    await running;
    expect(save.mock.calls[0][3]).toBe('local-password');
    expect(controller.saveState).toBe('saved');
  });

  it('keeps the changes as the own and as a draft when the password is not given', async () => {
    const { controller, client } = await open('workshop#note-release-password');
    status.set(await client.getStatus());
    controller.change('/status', 'agreed');
    const running = controller.save();
    controller.stepUp.cancel();
    await running;
    expect(controller.saveState).toBe('changed');
    expect(controller.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(controller.saveState).toBe('draft');
  });

  it('keeps the changes as the draft before the app leaves for the identity provider, and takes no edit meanwhile', async () => {
    const { controller, client, navigate } = await open('workshop', N3);
    vi.spyOn(client, 'saveDocument').mockRejectedValue(
      new ApiError('STEP_UP_REQUIRED', 403, [], { stepUp: '/api/v1/auth/login?step-up=mfa' }),
    );
    const draft = vi.spyOn(client, 'saveDraft');
    controller.change('/summary', 'Kept for the return.');
    await controller.save();
    expect(draft).toHaveBeenCalledWith(REPOSITORY, N3, expect.anything());
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('step-up=mfa'));
    expect(controller.leaving).toBe(true);
    expect(controller.locked).toBe(true);
    controller.change('/status', 'open');
    expect(controller.edits['/status']).toBeUndefined();
  });

  it('stays on the page, with the failure shown, when the draft cannot be kept before the departure', async () => {
    const { controller, client, navigate } = await open('workshop', N3);
    vi.spyOn(client, 'saveDocument').mockRejectedValue(
      new ApiError('STEP_UP_REQUIRED', 403, [], { stepUp: '/api/v1/auth/login?step-up=mfa' }),
    );
    vi.spyOn(client, 'saveDraft').mockRejectedValue(new ApiError('NETWORK', 0));
    controller.change('/summary', 'Not kept.');
    await controller.save();
    expect(navigate).not.toHaveBeenCalled();
    expect(controller.leaving).toBe(false);
    expect(controller.saveState).toBe('failed');
    expect(controller.failure).toBe('error.network');
  });

  it('uses the handler it was given', async () => {
    const { client, document } = await open('workshop');
    const own = new DocumentController({ repository: REPOSITORY, client });
    const other = new DocumentController({ repository: REPOSITORY, client, stepUp: own.stepUp });
    other.sync(snapshotOf(document));
    expect(other.stepUp).toBe(own.stepUp);
  });
});

describe('a transition', () => {
  it('submits a complete document and asks the view to read it again', async () => {
    const onrefresh = vi.fn();
    const { controller, document } = await open('workshop', N2, { onrefresh }, { draft: null });
    expect(document.transitions.map((entry) => entry.id)).toEqual(['test-note.submit']);
    const result = await controller.transition(document.transitions[0]);
    expect(result).toEqual({ kind: 'transitioned', state: 'in-review', version: 1 });
    expect(onrefresh).toHaveBeenCalledOnce();
  });

  it('answers with the pointers of the empty mandatory fields, and keeps them for the form', async () => {
    const { controller } = await open('workshop', N3);
    const result = await controller.transition('test-note.submit');
    expect(result).toEqual({ kind: 'missing', pointers: ['/noted', '/status'] });
    expect(controller.missing).toEqual(['/noted', '/status']);
    expect(controller.failure).toBe('error.mandatory-fields-missing');
  });

  it('forgets the missing fields of the last refusal when the next one starts', async () => {
    const { controller, client } = await open('workshop', N3);
    await controller.transition('test-note.submit');
    expect(controller.missing).toHaveLength(2);
    vi.spyOn(client, 'transition').mockRejectedValueOnce(new ApiError('REJECTED', 502));
    await controller.transition('test-note.submit');
    expect(controller.missing).toEqual([]);
  });

  it('acts on the saved document: with unsaved changes nothing is sent', async () => {
    const { controller, client } = await open('workshop', N3);
    const transition = vi.spyOn(client, 'transition');
    controller.change('/summary', 'x');
    expect(await controller.transition('test-note.submit')).toEqual({ kind: 'unsaved' });
    expect(transition).not.toHaveBeenCalled();
  });

  it('leaves for the identity provider when the submit asks for step-up', async () => {
    const { controller, navigate } = await open(
      'workshop#note-submit-step-up',
      N2,
      {},
      { draft: null },
    );
    expect(await controller.transition('test-note.submit')).toEqual({ kind: 'handled' });
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('step-up=mfa'));
  });

  it("names the refusals that are the view's", async () => {
    const rejected = await open('workshop#note-rejected', N2, {}, { draft: null });
    expect(await rejected.controller.transition('test-note.submit')).toEqual({
      kind: 'refused',
      outcome: 'REJECTED',
    });
    expect(rejected.controller.failure).toBe('error.rejected');
    const offline = await open('workshop#note-git-unavailable', N2, {}, { draft: null });
    expect(await offline.controller.transition('test-note.submit')).toEqual({
      kind: 'refused',
      outcome: 'GIT_UNAVAILABLE',
    });
  });

  it('sends nothing without a document', async () => {
    const controller = new DocumentController({ repository: REPOSITORY });
    expect(await controller.transition('x')).toEqual({ kind: 'refused', outcome: 'UNEXPECTED' });
  });
});

describe('frozen, read-only and revisions', () => {
  it('shows a frozen document and a missing right as read-only, and accepts no change', async () => {
    const { controller, document } = await open('workshop', N6);
    expect(controller.readonly).toBe(false);
    expect(controller.readonlyReason).toBeNull();
    controller.sync(snapshotOf(document, { frozen: true }));
    expect(controller.readonly).toBe(true);
    expect(controller.readonlyReason).toBe('frozen');
    controller.change('/summary', 'x');
    expect(controller.dirty).toBe(false);
    controller.sync(snapshotOf(document, { canEdit: false }));
    expect(controller.readonlyReason).toBe('right');
    controller.setValue({ title: 'x' });
    expect(controller.dirty).toBe(false);
  });

  it('is read-only without a document', () => {
    const controller = new DocumentController({ repository: REPOSITORY });
    expect(controller.readonly).toBe(true);
    expect(controller.readonlyReason).toBeNull();
    controller.change('/x', 1);
    expect(controller.dirty).toBe(false);
  });

  it('reads a revision as frozen', async () => {
    const { client } = await open('workshop', N6);
    const revision = await client.getDocument(REPOSITORY, N6, 'v1');
    const controller = new DocumentController({ repository: REPOSITORY, client });
    controller.sync(snapshotOf(revision));
    expect(revision.at?.ref).toBe('v1');
    expect(controller.readonly).toBe(true);
  });
});

describe('the live refresh', () => {
  it('asks the view to read the document again when a save or a transition of it is announced', async () => {
    const onrefresh = vi.fn();
    const { controller, client } = await open('workshop', N2, { onrefresh });
    let listener: (event: string, data: unknown) => void = () => {};
    const stop = vi.fn();
    vi.spyOn(client, 'subscribeEvents').mockImplementation((next) => {
      listener = next;
      return stop;
    });
    const unsubscribe = controller.watch();
    listener('document-saved', { repository: REPOSITORY, id: N2, fields: ['/summary'] });
    listener('document-transitioned', { repository: REPOSITORY, id: N2, state: 'in-review' });
    expect(onrefresh).toHaveBeenCalledTimes(2);
    listener('document-saved', { repository: REPOSITORY, id: N3 });
    listener('document-created', { repository: REPOSITORY, id: N2 });
    expect(onrefresh).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('ignores an event while no document is open', () => {
    const onrefresh = vi.fn();
    const client = new ApiClient(() => {});
    const controller = new DocumentController({ repository: REPOSITORY, client, onrefresh });
    let listener: (event: string, data: unknown) => void = () => {};
    vi.spyOn(client, 'subscribeEvents').mockImplementation((next) => {
      listener = next;
      return () => {};
    });
    controller.watch();
    listener('document-saved', { repository: REPOSITORY, id: N2 });
    expect(onrefresh).not.toHaveBeenCalled();
  });
});

describe('a form that edits one JSON value', () => {
  it('turns the form value into the top-level fields that changed, a list as a whole', async () => {
    const { controller } = await open('workshop', N3);
    const base = controller.value;
    controller.setValue({ ...base, summary: 'Changed.', actions: [{ what: 'a' }] });
    expect(controller.edits).toEqual({ '/summary': 'Changed.', '/actions': [{ what: 'a' }] });
    const { summary, ...without } = base;
    expect(summary).toBeDefined();
    controller.setValue(without);
    expect(controller.edits).toEqual({ '/summary': null });
    expect(controller.value.summary).toBeUndefined();
  });

  it('shows the loaded value of a document without edits, and nothing without a document', async () => {
    const { controller, document } = await open('workshop', N3);
    expect(controller.value).toEqual(document.parts.data.value);
    expect(new DocumentController({ repository: REPOSITORY }).value).toEqual({});
  });
});
