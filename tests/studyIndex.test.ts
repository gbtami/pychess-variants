import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { initStudyIndex } from '../client/study/studyIndex';

describe('Study index creation dialog', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button type="button" data-study-new-open>New study</button>
            <dialog id="study-new-dialog">
                <input name="name" value="owner's Study">
                <button type="button" data-study-new-close>Cancel</button>
            </dialog>
        `;
    });

    test('opens, focuses the name, and closes from the dialog controls', () => {
        const dialog = document.querySelector<HTMLDialogElement>('#study-new-dialog')!;
        const openButton = document.querySelector<HTMLButtonElement>('[data-study-new-open]')!;
        const nameInput = dialog.querySelector<HTMLInputElement>('input[name="name"]')!;
        const closeButton = dialog.querySelector<HTMLButtonElement>('[data-study-new-close]')!;

        const showModal = jest.fn(() => dialog.setAttribute('open', ''));
        const close = jest.fn(() => {
            dialog.removeAttribute('open');
            dialog.dispatchEvent(new Event('close'));
        });
        dialog.showModal = showModal;
        dialog.close = close;

        initStudyIndex();
        openButton.click();

        expect(showModal).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(nameInput);

        closeButton.click();
        expect(close).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(openButton);
    });
});
