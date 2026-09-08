export function initStudyIndex(): void {
    const dialog = document.querySelector<HTMLDialogElement>('#study-new-dialog');
    const openButton = document.querySelector<HTMLButtonElement>('[data-study-new-open]');
    if (!dialog || !openButton) return;

    const nameInput = dialog.querySelector<HTMLInputElement>('input[name="name"]');

    openButton.addEventListener('click', () => {
        if (!dialog.open) dialog.showModal();
        nameInput?.focus();
        nameInput?.select();
    });

    dialog.querySelectorAll<HTMLButtonElement>('[data-study-new-close]').forEach(button => {
        button.addEventListener('click', () => dialog.close());
    });

    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener('close', () => openButton.focus());
}
