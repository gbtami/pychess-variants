interface SystemMessageResponse {
    message?: string;
}

function responseMessage(payload: SystemMessageResponse, fallback: string): string {
    return payload.message || fallback;
}

export function initAdminSystemMessages(root: ParentNode = document): void {
    const form = root.querySelector<HTMLFormElement>('#admin-system-message-form');
    if (!form || form.dataset.systemMessagesReady === 'true') return;

    const feedback = root.querySelector<HTMLElement>('.admin-ops-feedback');
    const recipients = root.querySelector<HTMLElement>('#admin-system-message-recipients');
    const recipientsInput = recipients?.querySelector<HTMLTextAreaElement>('textarea[name="recipients"]');
    const messageInput = form.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
    const dialog = root.querySelector<HTMLDialogElement>('#admin-system-message-dialog');
    const dialogText = dialog?.querySelector<HTMLElement>('.admin-action-dialog__text');
    const confirmButton = dialog?.querySelector<HTMLButtonElement>('.admin-system-message-confirm');
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');

    if (!recipients || !recipientsInput || !messageInput || !dialog || !dialogText || !confirmButton) return;
    form.dataset.systemMessagesReady = 'true';

    const selectedAudience = (): string =>
        form.querySelector<HTMLInputElement>('input[name="audience"]:checked')?.value || 'selected';

    const syncAudience = (): void => {
        const selected = selectedAudience() === 'selected';
        recipients.hidden = !selected;
        recipientsInput.required = selected;
    };

    const showFeedback = (message: string, status: '' | 'error' | 'success'): void => {
        if (!feedback) return;
        feedback.textContent = message;
        feedback.dataset.status = status;
    };

    const submitMessage = async (): Promise<void> => {
        if (submitButton) submitButton.disabled = true;
        confirmButton.disabled = true;
        showFeedback('', '');

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
            });
            const payload = (await response.json()) as SystemMessageResponse;
            if (!response.ok) {
                showFeedback(responseMessage(payload, `Send failed (HTTP ${response.status}).`), 'error');
                return;
            }
            showFeedback(responseMessage(payload, 'System message sent.'), 'success');
            messageInput.value = '';
        } catch {
            showFeedback('Send failed. Please try again.', 'error');
        } finally {
            if (submitButton) submitButton.disabled = false;
            confirmButton.disabled = false;
            dialog.close();
        }
    };

    form.querySelectorAll<HTMLInputElement>('input[name="audience"]').forEach(input => {
        input.addEventListener('change', syncAudience);
    });
    syncAudience();

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        if (selectedAudience() === 'active') {
            dialogText.textContent =
                'Send this inbox message from PyChess to every eligible active human user? This can create many inbox documents.';
        } else {
            dialogText.textContent = `Send this inbox message from PyChess to: ${recipientsInput.value.trim()}?`;
        }
        dialog.showModal();
    });

    confirmButton.addEventListener('click', () => void submitMessage());
}
