import { expect, jest, test } from '@jest/globals';

import { patch } from '../client/document';
import {
    studyChapterCreateForm,
    studyChapterModeField,
    studyChapterOrientationField,
    studyEnabledModesFromJson,
} from '../client/study/studyChapterForm';

const ALL_STUDY_MODES = ['normal', 'practice', 'conceal', 'gamebook'] as const;

function mount(vnode: ReturnType<typeof studyChapterCreateForm> | ReturnType<typeof studyChapterModeField>) {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, vnode);
}

test('chapter creation exposes learner orientation and the staged default analysis modes', () => {
    mount(
        studyChapterCreateForm('/study/StUdY001/chapter', 'chess', false, {
            orientation: 'black',
        }),
    );

    expect(document.querySelector<HTMLSelectElement>('select[name="orientation"]')?.value).toBe('black');
    expect(document.querySelector('.study-chapter-orientation .study-dialog__help')?.textContent).toContain(
        'learner side',
    );
    const mode = document.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    expect(mode.value).toBe('normal');
    expect([...mode.options].map(option => option.value)).toEqual(['normal', 'gamebook']);
    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'full move tree',
    );
});


test('deployment mode gate hides disabled entry modes but keeps an existing disabled mode editable', () => {
    mount(studyChapterModeField('normal', ['normal', 'conceal']));
    let mode = document.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    expect([...mode.options].map(option => option.value)).toEqual(['normal', 'conceal']);

    mount(studyChapterModeField('practice', ['normal']));
    mode = document.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    expect(mode.value).toBe('practice');
    expect([...mode.options].map(option => option.value)).toEqual(['normal', 'practice']);
    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'disabled for new chapters right now',
    );
});

test('enabled mode bootstrap is tolerant of an older server while enforcing normal as the escape hatch', () => {
    expect(studyEnabledModesFromJson(null)).toEqual(['normal', 'gamebook']);
    expect(studyEnabledModesFromJson('["gamebook","conceal"]')).toEqual(['normal', 'conceal', 'gamebook']);
    expect(studyEnabledModesFromJson('["training"]')).toEqual(['normal']);
    expect(studyEnabledModesFromJson('not-json')).toEqual(['normal', 'gamebook']);
});

test('computer practice is exposed with its completed-mode help text', () => {
    document.body.innerHTML = '<div id="root"></div>';
    patch(
        document.getElementById('root')!,
        studyChapterModeField('practice', ['normal', 'practice', 'conceal', 'gamebook']),
    );

    const mode = document.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    expect(mode.value).toBe('practice');
    expect([...mode.options].map(option => option.value)).toEqual(['normal', 'practice', 'conceal', 'gamebook']);
    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        "starting position against the computer. The saved moves do not control the computer's replies",
    );
});

test('analysis mode help follows the newly selected completed mode', () => {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, studyChapterModeField('normal', ALL_STUDY_MODES));

    const mode = document.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    mode.value = 'conceal';
    mode.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'Hide unrevealed moves from viewers while the presenter advances the chapter',
    );

    mode.value = 'gamebook';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'Let viewers solve the authored main line with hints and feedback',
    );
});

test('Hide next moves submits the conceal mode value', () => {
    mount(studyChapterCreateForm('/study', 'chess', false, { enabledModes: ALL_STUDY_MODES }));

    const form = document.querySelector<HTMLFormElement>('form.study-side__new-chapter')!;
    const mode = form.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    mode.value = 'conceal';
    mode.dispatchEvent(new Event('change', { bubbles: true }));

    expect(new FormData(form).get('mode')).toBe('conceal');
});

test('orientation field labels the selected learner side', () => {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, studyChapterOrientationField('white'));

    expect(document.querySelector<HTMLSelectElement>('select[name="orientation"]')?.value).toBe('white');
    expect(document.body.textContent).toContain('Orientation / learner side');
});

test('chapter creation waits for pending Study writes before allowing native submission', async () => {
    let release!: (value: boolean) => void;
    const beforeSubmit = jest.fn(
        () =>
            new Promise<boolean>(resolve => {
                release = resolve;
            }),
    );
    mount(studyChapterCreateForm('/study/StUdY001/chapter', 'chess', false, { beforeSubmit }));
    const form = document.querySelector<HTMLFormElement>('form.study-side__new-chapter')!;
    form.reportValidity = jest.fn(() => true);
    form.submit = jest.fn();

    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(event)).toBe(false);
    expect(beforeSubmit).toHaveBeenCalledTimes(1);
    expect(form.submit).not.toHaveBeenCalled();

    release(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(form.submit).toHaveBeenCalledTimes(1);
});

test('chapter creation refreshes shared-sync state immediately before native submission', async () => {
    let sync = false;
    mount(
        studyChapterCreateForm('/study/StUdY001/chapter', 'chess', false, {
            sync: () => sync,
            beforeSubmit: async () => true,
        }),
    );
    const form = document.querySelector<HTMLFormElement>('form.study-side__new-chapter')!;
    form.reportValidity = jest.fn(() => true);
    form.submit = jest.fn();

    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(event)).toBe(false);
    sync = true;
    await Promise.resolve();
    await Promise.resolve();

    expect(new FormData(form).get('sync')).toBe('1');
    expect(form.submit).toHaveBeenCalledTimes(1);
});

test('existing Study chapter creation offers a PGN source and imports pasted PGN asynchronously', async () => {
    const beforeSubmit = jest.fn(async () => true);
    const pgnImport = jest.fn(async (_pgn: string) => {});
    mount(
        studyChapterCreateForm('/study/StUdY001/chapter', 'chess', false, {
            beforeSubmit,
            pgnImport,
        }),
    );

    const form = document.querySelector<HTMLFormElement>('form.study-side__new-chapter')!;
    form.reportValidity = jest.fn(() => true);
    const setupTab = form.querySelector<HTMLButtonElement>('[data-study-chapter-source="setup"]')!;
    const pgnTab = form.querySelector<HTMLButtonElement>('[data-study-chapter-source="pgn"]')!;
    const setupPanel = form.querySelector<HTMLElement>('[data-study-chapter-source-panel="setup"]')!;
    const pgnPanel = form.querySelector<HTMLElement>('[data-study-chapter-source-panel="pgn"]')!;
    const pgn = form.querySelector<HTMLTextAreaElement>('textarea[name="pgn"]')!;

    expect(setupTab.getAttribute('aria-selected')).toBe('true');
    expect(pgnPanel.hidden).toBe(true);
    expect(pgn.disabled).toBe(true);

    pgnTab.click();
    expect(setupPanel.hidden).toBe(true);
    expect(pgnPanel.hidden).toBe(false);
    expect(pgn.disabled).toBe(false);
    expect(form.querySelector<HTMLSelectElement>('select[name="variant"]')?.disabled).toBe(true);
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe('Import PGN');

    pgn.value = '[Event "Imported"]\n\n1. e4 e5 *';
    expect(form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(beforeSubmit).toHaveBeenCalledTimes(1);
    expect(pgnImport).toHaveBeenCalledWith(pgn.value);

    setupTab.click();
    expect(setupPanel.hidden).toBe(false);
    expect(pgnPanel.hidden).toBe(true);
    expect(form.querySelector<HTMLSelectElement>('select[name="variant"]')?.disabled).toBe(false);
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe('Create chapter');
});

test('PGN file selection loads the file into the paste area and imports that text', async () => {
    const pgnImport = jest.fn(async (_pgn: string) => {});
    mount(studyChapterCreateForm('/study/StUdY001/chapter', 'chess', false, { pgnImport }));

    const form = document.querySelector<HTMLFormElement>('form.study-side__new-chapter')!;
    form.reportValidity = jest.fn(() => true);
    form.querySelector<HTMLButtonElement>('[data-study-chapter-source="pgn"]')!.click();
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="pgn"]')!;
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"][accept=".pgn"]')!;
    const source = '[Event "Uploaded"]\n\n1. d4 d5 2. c4 *';
    const file = new File([source], 'study.pgn', { type: 'application/x-chess-pgn' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    const loaded = new Promise<void>(resolve => textarea.addEventListener('input', () => resolve(), { once: true }));

    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await loaded;

    expect(textarea.value).toBe(source);
    expect(fileInput.disabled).toBe(false);

    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pgnImport).toHaveBeenCalledWith(source);
});

test('PGN import errors stay in the chapter dialog with parser diagnostics', async () => {
    const pgnImport = jest.fn(async () => {
        throw new Error('PGN parse error at line 3, column 7: Expected move.');
    });
    mount(studyChapterCreateForm('/study/StUdY001/chapter', 'chess', false, { pgnImport }));

    const form = document.querySelector<HTMLFormElement>('form.study-side__new-chapter')!;
    form.reportValidity = jest.fn(() => true);
    form.querySelector<HTMLButtonElement>('[data-study-chapter-source="pgn"]')!.click();
    form.querySelector<HTMLTextAreaElement>('textarea[name="pgn"]')!.value = 'broken pgn';

    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    const error = form.querySelector<HTMLElement>('.study-pgn-import__error')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('line 3, column 7');
    expect(form.getAttribute('aria-busy')).toBeNull();
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
});
