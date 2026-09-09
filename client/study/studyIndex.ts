import { patch } from '../document';
import { studyChapterCreateForm } from './studyChapterForm';

const STUDY_SETTING_FIELDS = ['name', 'visibility', 'computer', 'explorer', 'cloneable', 'shareable'] as const;

function focusAndSelect(input: HTMLInputElement | null): void {
    input?.focus();
    input?.select();
}

export function initStudyIndex(): void {
    const dialog = document.querySelector<HTMLDialogElement>('#study-new-dialog');
    const chapterDialog = document.querySelector<HTMLDialogElement>('#study-first-chapter-dialog');
    const chapterFormMount = document.querySelector<HTMLElement>('#study-first-chapter-form-mount');
    const openButton = document.querySelector<HTMLButtonElement>('[data-study-new-open]');
    const settingsForm = document.querySelector<HTMLFormElement>('#study-create-form');
    if (!dialog || !chapterDialog || !chapterFormMount || !openButton || !settingsForm) return;

    const chapterForm = patch(
        chapterFormMount,
        studyChapterCreateForm('/study', 'chess', false, { id: 'study-first-chapter-form', chapterName: 'Chapter 1' }),
    ).elm as HTMLFormElement;
    const nameInput = dialog.querySelector<HTMLInputElement>('input[name="name"]');
    const chapterNameInput = chapterForm.querySelector<HTMLInputElement>('input[name="chapterName"]');

    const closeDialog = (modal: HTMLDialogElement): void => {
        if (modal.open) modal.close();
    };

    const copyStudySettings = (): void => {
        chapterForm.querySelectorAll<HTMLInputElement>('input[data-study-setting]').forEach(input => input.remove());
        const formData = new FormData(settingsForm);
        for (const field of STUDY_SETTING_FIELDS) {
            const value = formData.get(field);
            if (typeof value !== 'string') continue;
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = field;
            input.value = value;
            input.dataset.studySetting = '';
            chapterForm.append(input);
        }
    };

    openButton.addEventListener('click', () => {
        if (!dialog.open) dialog.showModal();
        focusAndSelect(nameInput);
    });

    settingsForm.addEventListener('submit', event => {
        event.preventDefault();
        if (!settingsForm.reportValidity()) return;
        copyStudySettings();
        closeDialog(dialog);
        if (!chapterDialog.open) chapterDialog.showModal();
        focusAndSelect(chapterNameInput);
    });

    dialog.querySelectorAll<HTMLButtonElement>('[data-study-new-close]').forEach(button => {
        button.addEventListener('click', () => closeDialog(dialog));
    });
    chapterDialog.querySelectorAll<HTMLButtonElement>('[data-study-first-chapter-close]').forEach(button => {
        button.addEventListener('click', () => closeDialog(chapterDialog));
    });

    for (const modal of [dialog, chapterDialog]) {
        modal.addEventListener('click', event => {
            if (event.target === modal) closeDialog(modal);
        });
        modal.addEventListener('close', () => openButton.focus());
    }
}
