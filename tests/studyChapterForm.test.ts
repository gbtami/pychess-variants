import { expect, jest, test } from '@jest/globals';

import { patch } from '../client/document';
import {
    studyChapterCreateForm,
    studyChapterModeField,
    studyChapterOrientationField,
    studyEnabledModesFromJson,
} from '../client/study/studyChapterForm';

function mount(vnode: ReturnType<typeof studyChapterCreateForm> | ReturnType<typeof studyChapterModeField>) {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, vnode);
}

test('chapter creation exposes learner orientation and every completed analysis mode', () => {
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
    expect([...mode.options].map(option => option.value)).toEqual(['normal', 'practice', 'conceal', 'gamebook']);
    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'complete chapter tree',
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
    expect(studyEnabledModesFromJson(null)).toEqual(['normal', 'practice', 'conceal', 'gamebook']);
    expect(studyEnabledModesFromJson('["gamebook","conceal"]')).toEqual(['normal', 'conceal', 'gamebook']);
    expect(studyEnabledModesFromJson('["training"]')).toEqual(['normal']);
    expect(studyEnabledModesFromJson('not-json')).toEqual(['normal', 'practice', 'conceal', 'gamebook']);
});

test('computer practice is exposed with its completed-mode help text', () => {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, studyChapterModeField('practice'));

    const mode = document.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    expect(mode.value).toBe('practice');
    expect([...mode.options].map(option => option.value)).toEqual(['normal', 'practice', 'conceal', 'gamebook']);
    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'Play the saved position against the computer',
    );
});

test('analysis mode help follows the newly selected completed mode', () => {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, studyChapterModeField('normal'));

    const mode = document.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    mode.value = 'conceal';
    mode.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'Hide unrevealed continuations',
    );
});

test('Hide next moves submits the conceal mode value', () => {
    mount(studyChapterCreateForm('/study', 'chess', false));

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
    form.requestSubmit = jest.fn();

    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(event)).toBe(false);
    expect(beforeSubmit).toHaveBeenCalledTimes(1);
    expect(form.requestSubmit).not.toHaveBeenCalled();

    release(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
});
