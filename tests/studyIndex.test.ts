import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { initStudyIndex } from '../client/study/studyIndex';

describe('Study index creation dialogs', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button type="button" data-study-new-open>New study</button>
            <dialog id="study-new-dialog">
                <form id="study-create-form">
                    <input name="name" value="owner's Study">
                    <select name="visibility"><option value="private" selected>Private</option></select>
                    <select name="computer"><option value="everyone" selected>Everyone</option></select>
                    <input type="hidden" name="explorer" value="everyone">
                    <select name="cloneable"><option value="everyone" selected>Everyone</option></select>
                    <select name="shareable"><option value="everyone" selected>Everyone</option></select>
                    <button type="submit">Start</button>
                </form>
                <button type="button" data-study-new-close>Cancel</button>
            </dialog>
            <dialog id="study-first-chapter-dialog">
                <div id="study-first-chapter-form-mount"></div>
                <button type="button" data-study-first-chapter-close>Close</button>
            </dialog>
        `;
    });

    function mockDialog(dialog: HTMLDialogElement) {
        const showModal = jest.fn(() => dialog.setAttribute('open', ''));
        const close = jest.fn(() => {
            dialog.removeAttribute('open');
            dialog.dispatchEvent(new Event('close'));
        });
        dialog.showModal = showModal;
        dialog.close = close;
        return { showModal, close };
    }

    test('opens the Study settings dialog and closes it from its controls', () => {
        const dialog = document.querySelector<HTMLDialogElement>('#study-new-dialog')!;
        const chapterDialog = document.querySelector<HTMLDialogElement>('#study-first-chapter-dialog')!;
        const openButton = document.querySelector<HTMLButtonElement>('[data-study-new-open]')!;
        const nameInput = dialog.querySelector<HTMLInputElement>('input[name="name"]')!;
        const closeButton = dialog.querySelector<HTMLButtonElement>('[data-study-new-close]')!;
        const { showModal, close } = mockDialog(dialog);
        mockDialog(chapterDialog);

        initStudyIndex();
        openButton.click();

        expect(showModal).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(nameInput);

        closeButton.click();
        expect(close).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(openButton);
    });

    test('Start opens the first-chapter dialog without submitting the Study settings form', () => {
        const dialog = document.querySelector<HTMLDialogElement>('#study-new-dialog')!;
        const chapterDialog = document.querySelector<HTMLDialogElement>('#study-first-chapter-dialog')!;
        const settingsForm = document.querySelector<HTMLFormElement>('#study-create-form')!;
        const { close } = mockDialog(dialog);
        const { showModal } = mockDialog(chapterDialog);
        const openButton = document.querySelector<HTMLButtonElement>('[data-study-new-open]')!;
        settingsForm.reportValidity = jest.fn(() => true);

        initStudyIndex();
        const chapterForm = document.querySelector<HTMLFormElement>('#study-first-chapter-form')!;
        const chapterName = chapterDialog.querySelector<HTMLInputElement>('input[name="chapterName"]')!;
        openButton.click();
        settingsForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(close).toHaveBeenCalledTimes(1);
        expect(showModal).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(chapterName);
        expect(chapterName.value).toBe('Chapter 1');
        expect(chapterForm.querySelector<HTMLSelectElement>('select[name="variant"]')?.value).toBe('chess');
        expect(chapterForm.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("owner's Study");
        expect(chapterForm.querySelector<HTMLInputElement>('input[name="visibility"]')?.value).toBe('private');
        expect(chapterForm.querySelector<HTMLInputElement>('input[name="computer"]')?.value).toBe('everyone');
        expect(chapterForm.querySelector<HTMLInputElement>('input[name="cloneable"]')?.value).toBe('everyone');
        expect(chapterForm.querySelector<HTMLInputElement>('input[name="shareable"]')?.value).toBe('everyone');
    });
});
