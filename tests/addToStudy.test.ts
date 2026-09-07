import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { chooseStudy } from '../client/study/addToStudy';

const originalFetch = globalThis.fetch;

function mockChoices(studies: Array<{ id: string; name: string }>): void {
    const fetchMock = jest.fn<typeof fetch>();
    fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ studies }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: fetchMock });
}

async function flushDialogOpen(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch });
    jest.restoreAllMocks();
});

describe('Add to Study chooser', () => {
    test('offers a new Study and existing owned Studies', async () => {
        mockChoices([
            { id: 'Study001', name: 'Openings' },
            { id: 'Study002', name: 'Endgames' },
        ]);

        const resultPromise = chooseStudy('White - Black');
        await flushDialogOpen();
        const select = document.querySelector<HTMLSelectElement>('.study-add-dialog__study');
        const chapter = document.querySelector<HTMLInputElement>('.study-add-dialog__chapter-name');
        expect([...select!.options].map(option => option.textContent)).toEqual(['New study', 'Openings', 'Endgames']);
        expect(chapter?.value).toBe('White - Black');

        select!.value = 'Study002';
        select!.dispatchEvent(new Event('change'));
        expect(document.querySelector<HTMLInputElement>('.study-add-dialog__study-name')?.disabled).toBe(true);
        document.querySelector<HTMLButtonElement>('.study-add-dialog__submit')!.click();

        await expect(resultPromise).resolves.toEqual({
            studyId: 'Study002',
            studyName: undefined,
            chapterName: 'White - Black',
        });
    });

    test('returns new Study and edited chapter names', async () => {
        mockChoices([]);
        const resultPromise = chooseStudy('Analysis');
        await flushDialogOpen();
        const studyName = document.querySelector<HTMLInputElement>('.study-add-dialog__study-name')!;
        const chapterName = document.querySelector<HTMLInputElement>('.study-add-dialog__chapter-name')!;
        studyName.value = 'My analysis';
        chapterName.value = 'Critical line';
        document.querySelector<HTMLButtonElement>('.study-add-dialog__submit')!.click();

        await expect(resultPromise).resolves.toEqual({
            studyId: undefined,
            studyName: 'My analysis',
            chapterName: 'Critical line',
        });
    });

    test('escape cancels without submitting', async () => {
        mockChoices([{ id: 'Study001', name: 'Openings' }]);
        const resultPromise = chooseStudy('White - Black');
        await flushDialogOpen();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await expect(resultPromise).resolves.toBeNull();
    });
});
