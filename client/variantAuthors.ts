export function initVariantAuthors(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-author-dialog]').forEach(button => {
        const dialogId = button.dataset.authorDialog;
        if (!dialogId) return;

        const dialog = document.getElementById(dialogId);
        if (!(dialog instanceof HTMLDialogElement)) return;

        const closeButton = dialog.querySelector<HTMLButtonElement>('[data-author-dialog-close]');

        button.addEventListener('click', () => dialog.showModal());
        closeButton?.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.close();
        });
    });
}
