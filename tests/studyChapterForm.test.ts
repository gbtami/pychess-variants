import { expect, jest, test } from '@jest/globals';

import { patch } from '../client/document';
import {
    studyChapterCreateForm,
    studyChapterModeField,
    studyChapterOrientationField,
} from '../client/study/studyChapterForm';

function mount(vnode: ReturnType<typeof studyChapterCreateForm> | ReturnType<typeof studyChapterModeField>) {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, vnode);
}

test('chapter creation exposes learner orientation while advertising only completed analysis modes', () => {
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
    expect([...mode.options].map(option => option.value)).toEqual(['normal']);
    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'complete chapter tree',
    );
});

test('an existing unfinished mode remains identifiable but other unfinished modes are not advertised', () => {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, studyChapterModeField('conceal'));

    const mode = document.querySelector<HTMLSelectElement>('select[name="mode"]')!;
    expect(mode.value).toBe('conceal');
    expect([...mode.options].map(option => option.value)).toEqual(['normal', 'conceal']);
    expect(document.querySelector('.study-chapter-mode .study-dialog__help')?.textContent).toContain(
        'not available in the player yet',
    );
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
