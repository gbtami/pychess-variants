import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { StudyChapterNavigation, type StudyChapterSnapshot } from '../client/study/chapterNavigation';

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn<typeof fetch>();
beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
    window.history.replaceState(null, '', '/study/study001/first');
});
afterEach(() => {
    globalThis.fetch = originalFetch;
});
function response(id: string): Response {
    return {
        ok: true,
        json: async () => ({
            study: { id: 'study001', chapter: { id } },
            board: { steps: [] },
            cataloguedVariants: [],
        }),
    } as Response;
}
function setup(flush: () => Promise<void> = async () => {}) {
    let current = 'first';
    const apply = jest.fn(async (data: StudyChapterSnapshot) => {
        current = data.study.chapter.id;
    });
    const error = jest.fn();
    const busy = jest.fn();
    const nav = new StudyChapterNavigation({
        studyId: 'study001',
        currentChapter: () => current,
        flush,
        apply,
        error,
        busy,
    });
    return { nav, apply, error, busy };
}

test('waits for saved edits before fetching and pushing the chapter URL', async () => {
    let saved!: () => void;
    const pending = new Promise<void>(resolve => {
        saved = resolve;
    });
    const { nav, apply } = setup(() => pending);
    fetchMock.mockResolvedValue(response('second'));
    const navigation = nav.go('second');
    expect(fetchMock).not.toHaveBeenCalled();
    saved();
    await navigation;
    expect(apply).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/study/study001/second');
});

test('failed saves leave the current chapter and URL intact', async () => {
    const { nav, error, busy } = setup(async () => {
        throw new Error('Save failed');
    });
    await nav.go('second');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(window.location.pathname).toBe('/study/study001/first');
});

test('a slow earlier chapter response cannot replace the latest selection', async () => {
    let first!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
        () =>
            new Promise(resolve => {
                first = resolve;
            }),
    );
    fetchMock.mockResolvedValueOnce(response('third'));
    const { nav, apply } = setup();
    const earlier = nav.go('second');
    await Promise.resolve();
    await nav.go('third');
    first(response('second'));
    await earlier;
    expect(apply).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/study/study001/third');
});

test('Back/Forward loads without pushing another history entry', async () => {
    const { nav } = setup();
    fetchMock.mockResolvedValue(response('second'));
    window.history.pushState(null, '', '/study/study001/second');
    const length = window.history.length;
    await nav.go('second', 'pop');
    expect(window.history.length).toBe(length);
});

test('an unavailable chapter leaves the mounted chapter intact', async () => {
    const { nav, apply, error } = setup();
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    await nav.go('missing');
    expect(apply).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/study/study001/first');
});
