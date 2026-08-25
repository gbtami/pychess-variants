import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { initAdminSystemMessages } from '../client/adminSystemMessages';

const originalFetch = globalThis.fetch;

function setupPage(): void {
    document.body.innerHTML = `
        <p class="admin-ops-feedback"></p>
        <form id="admin-system-message-form" action="/api/admin/system-messages/send" method="post">
            <input type="radio" name="audience" value="selected" checked>
            <input type="radio" name="audience" value="active">
            <label id="admin-system-message-recipients">
                <textarea name="recipients"></textarea>
            </label>
            <textarea name="text" required></textarea>
            <button type="submit">Send as PyChess</button>
        </form>
        <dialog id="admin-system-message-dialog">
            <p class="admin-action-dialog__text"></p>
            <button class="admin-system-message-confirm" type="button">Send message</button>
        </dialog>
    `;

    const dialog = document.querySelector<HTMLDialogElement>('#admin-system-message-dialog');
    if (!dialog) throw new Error('dialog missing');
    dialog.showModal = jest.fn(() => dialog.setAttribute('open', ''));
    dialog.close = jest.fn(() => dialog.removeAttribute('open'));
}

function chooseAudience(value: 'selected' | 'active'): void {
    const input = document.querySelector<HTMLInputElement>(`input[name="audience"][value="${value}"]`);
    if (!input) throw new Error(`audience ${value} missing`);
    input.checked = true;
    input.dispatchEvent(new Event('change'));
}

beforeEach(() => {
    setupPage();
});

afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch });
    jest.restoreAllMocks();
});

describe('system message admin page', () => {
    test('shows selected-user input only for the selected audience', () => {
        initAdminSystemMessages();

        const recipients = document.querySelector<HTMLElement>('#admin-system-message-recipients');
        const input = recipients?.querySelector<HTMLTextAreaElement>('textarea');
        expect(recipients?.hidden).toBe(false);
        expect(input?.required).toBe(true);

        chooseAudience('active');
        expect(recipients?.hidden).toBe(true);
        expect(input?.required).toBe(false);
    });

    test('asks for confirmation before posting an active-user broadcast', () => {
        initAdminSystemMessages();
        chooseAudience('active');

        const form = document.querySelector<HTMLFormElement>('#admin-system-message-form');
        const text = form?.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
        const dialog = document.querySelector<HTMLDialogElement>('#admin-system-message-dialog');
        if (!form || !text || !dialog) throw new Error('system message controls missing');
        text.value = 'Server maintenance tonight.';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(dialog.showModal).toHaveBeenCalledTimes(1);
        expect(dialog.textContent).toContain('every eligible active human user');
    });

    test('posts the form and reports success after confirmation', async () => {
        const fetchMock = jest.fn<typeof fetch>();
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ message: 'System message sent to 3 user(s).' }),
        } as Response);
        Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: fetchMock });

        initAdminSystemMessages();

        const form = document.querySelector<HTMLFormElement>('#admin-system-message-form');
        const recipients = form?.querySelector<HTMLTextAreaElement>('textarea[name="recipients"]');
        const text = form?.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
        const confirm = document.querySelector<HTMLButtonElement>('.admin-system-message-confirm');
        if (!form || !recipients || !text || !confirm) throw new Error('system message controls missing');
        recipients.value = 'alice, bob, carol';
        text.value = 'Hello from PyChess.';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        confirm.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://localhost/api/admin/system-messages/send');
        expect(init?.method).toBe('POST');
        expect(init?.body).toBeInstanceOf(FormData);
        const posted = init?.body as FormData;
        expect(posted.get('audience')).toBe('selected');
        expect(posted.get('recipients')).toBe('alice, bob, carol');
        expect(posted.get('text')).toBe('Hello from PyChess.');
        expect(document.querySelector('.admin-ops-feedback')?.textContent).toBe('System message sent to 3 user(s).');
        expect(text.value).toBe('');
    });
});
